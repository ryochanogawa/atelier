/**
 * Interactive Session Use Case
 * 対話モードのセッション管理。
 * 会話履歴をATELIER側で管理し、プロバイダー非依存で複数ラリーの対話を実現する。
 * セッションの永続化（保存・復元）にも対応する。
 *
 * v2: プロジェクトコンテキスト注入
 * - studio.yaml の knowledge / policy / database 設定を読み込む
 * - 壁打ち時にプロジェクト固有の知識（アーキテクチャ、命名規則、DB構造）を注入
 * - findings 蓄積により長いラリーでも情報が失われないようにする
 */

import path from "node:path";
import type { MediumPort, MediumExecuteRequest, MediumExecuteResponse } from "../../domain/ports/medium.port.js";
import { QueueTaskUseCase } from "./queue-task.use-case.js";
import { DEFAULT_TIMEOUT_MS, SESSIONS_DIR, POLICIES_DIR, KNOWLEDGE_DIR } from "../../shared/constants.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { writeTextFile, readTextFile, listFiles, fileExists, ensureDir } from "../../infrastructure/fs/file-system.js";

/** 会話メッセージ */
export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string;
}

/** セッション保存データ */
export interface SessionData {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: ConversationMessage[];
  readonly summary?: string;
}

/** プロジェクトコンテキスト（knowledge + policy + DB情報） */
export interface ProjectContext {
  readonly knowledgeContent: string | null;
  readonly projectPolicies: string | null;
  readonly allowedTools: readonly string[];
}

/**
 * InteractiveSessionUseCase
 * 会話履歴をATELIER側で保持し、毎回コンテキストとして組み立てて渡す。
 * これによりClaude/Codex/Geminiどのプロバイダーでも同じ対話体験を提供する。
 */
export class InteractiveSessionUseCase {
  private readonly history: ConversationMessage[] = [];
  private readonly medium: MediumPort;
  private readonly queueUseCase: QueueTaskUseCase;
  private readonly workingDirectory: string;
  private policyContent: string | null = null;
  private knowledgeContent: string | null = null;
  private projectPolicies: string | null = null;
  private allowedTools: readonly string[] = [];
  private findingsPath: string | null = null;
  private sessionId: string | null = null;
  private lastKnownFindings: string | null = null;

  constructor(
    medium: MediumPort,
    projectPath: string,
  ) {
    this.medium = medium;
    this.workingDirectory = projectPath;
    this.queueUseCase = new QueueTaskUseCase(projectPath);
  }

  /** ポリシーを読み込んでキャッシュする */
  async loadPolicy(): Promise<void> {
    try {
      // まずプロジェクト固有のポリシーを探す
      const atelierPath = resolveAtelierPath(this.workingDirectory);
      const projectPolicyDir = path.join(atelierPath, POLICIES_DIR);
      const projectPolicyFile = path.join(projectPolicyDir, "default-policy.yaml");

      if (await fileExists(projectPolicyFile)) {
        this.policyContent = await readTextFile(projectPolicyFile);
        return;
      }

      // ビルトインのデフォルトポリシーを読み込む
      const { getBuiltinPolicyPath } = await import("../../builtin/index.js");
      const builtinPath = getBuiltinPolicyPath("default-policy");
      if (await fileExists(builtinPath)) {
        this.policyContent = await readTextFile(builtinPath);
      }
    } catch {
      // ポリシーの読み込みに失敗しても続行
      this.policyContent = null;
    }
  }

  /**
   * プロジェクトコンテキストを読み込む。
   * .atelier/knowledge/ 配下の全 .md ファイルと、
   * .atelier/policies/ 配下の全 .yaml ファイルを読み込む。
   * allowedTools にMCPツール等を追加する場合はここで設定する。
   */
  async loadProjectContext(allowedTools?: readonly string[]): Promise<void> {
    const atelierPath = resolveAtelierPath(this.workingDirectory);

    // Knowledge ファイルの読み込み
    try {
      const knowledgeDir = path.join(atelierPath, KNOWLEDGE_DIR);
      const knowledgeFiles = await listFiles(knowledgeDir, ".md");
      if (knowledgeFiles.length > 0) {
        const contents: string[] = [];
        for (const file of knowledgeFiles) {
          const text = await readTextFile(file);
          const fileName = path.basename(file, ".md");
          contents.push(`### ${fileName}\n${text}`);
        }
        this.knowledgeContent = contents.join("\n\n---\n\n");
      }
    } catch {
      // knowledge ディレクトリがなくても続行
    }

    // プロジェクト固有ポリシーの読み込み（default-policy以外）
    try {
      const policyDir = path.join(atelierPath, POLICIES_DIR);
      const policyFiles = await listFiles(policyDir, ".yaml");
      const extraPolicies: string[] = [];
      for (const file of policyFiles) {
        const fileName = path.basename(file, ".yaml");
        // default-policy は loadPolicy() で既に読み込み済み
        if (fileName === "default-policy") continue;
        const text = await readTextFile(file);
        extraPolicies.push(`### ${fileName}\n${text}`);
      }
      if (extraPolicies.length > 0) {
        this.projectPolicies = extraPolicies.join("\n\n");
      }
    } catch {
      // policies ディレクトリがなくても続行
    }

    // MCP ツール等の許可リスト
    if (allowedTools && allowedTools.length > 0) {
      this.allowedTools = allowedTools;
    }

    // findings 蓄積用のセッションID・パスを初期化
    const now = new Date();
    this.sessionId = `${now.toISOString().slice(0, 10)}_${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
    const findingsDir = path.join(atelierPath, SESSIONS_DIR);
    await ensureDir(findingsDir);
    this.findingsPath = path.join(findingsDir, `${this.sessionId}_findings.md`);
  }

  /** findings ファイルのパスを返す */
  getFindingsPath(): string | null {
    return this.findingsPath;
  }

  /** findings ファイルの内容を読み込む */
  async getFindings(): Promise<string | null> {
    if (!this.findingsPath || !(await fileExists(this.findingsPath))) {
      return null;
    }
    return readTextFile(this.findingsPath);
  }

  /** プロジェクトコンテキストを返す */
  getProjectContext(): ProjectContext {
    return {
      knowledgeContent: this.knowledgeContent,
      projectPolicies: this.projectPolicies,
      allowedTools: this.allowedTools,
    };
  }

  /** ユーザーメッセージを送信し、AIの応答を取得する */
  async sendMessage(userMessage: string): Promise<string> {
    this.history.push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // 会話履歴をコンテキストとして含めたプロンプトを構築
    const contextPrompt = this.buildContextPrompt(userMessage);

    // findings の内容を読み込み、コンテキストとして活用
    const findings = await this.getFindings();

    const request: MediumExecuteRequest = {
      prompt: contextPrompt,
      workingDirectory: this.workingDirectory,
      allowEdit: false,
      allowReadTools: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      allowedTools: this.allowedTools.length > 0 ? this.allowedTools : undefined,
    };

    const response: MediumExecuteResponse = await this.medium.execute(request);

    this.history.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
    });

    // findings ファイルに蓄積（応答にfindingsブロックがあれば更新）
    await this.updateFindings(response.content);

    return response.content;
  }

  /**
   * AIの応答から findings ブロックを抽出し、ファイルに蓄積する。
   * AIの応答に `### 📋 蓄積された事実` セクションがあれば、findings.md を上書き更新する。
   * なければ会話のサマリを追記する。
   */
  private async updateFindings(aiResponse: string): Promise<void> {
    if (!this.findingsPath) return;

    // 蓄積された事実ブロックを探す（AIが出力する構造化セクション）
    const findingsMarker = "### 📋 蓄積された事実";
    const markerIdx = aiResponse.indexOf(findingsMarker);

    if (markerIdx >= 0) {
      // 構造化 findings が見つかった場合、そのセクション以降を保存
      const findingsBlock = aiResponse.slice(markerIdx);
      await writeTextFile(this.findingsPath, findingsBlock);
      // 次回の buildContextPrompt で使えるようキャッシュ
      this.lastKnownFindings = findingsBlock;
    }
  }

  /** AIに会話を要約させてタスク文字列を生成する */
  async summarizeForTask(additionalNote?: string): Promise<string> {
    const summarizePrompt = [
      "これまでの会話内容を元に、AIエージェントが実行するタスク指示書を生成してください。",
      "以下の構成で出力してください:",
      "",
      "## タスク概要",
      "## 実装すべき内容（優先度順）",
      "## 技術的な制約・方針",
      "## 受け入れ基準",
      "",
      "Markdown形式で、装飾的な説明は省いて本文のみ出力してください。",
      "AIエージェントが指示書として即座に実行できるよう、具体的かつ明確に記述してください。",
    ].join("\n");

    const fullPrompt = additionalNote
      ? `${summarizePrompt}\n\n追加指示: ${additionalNote}`
      : summarizePrompt;

    return this.sendMessage(fullPrompt);
  }

  /** 現在の会話からタスクを作成してキューに追加する */
  async queueTask(description: string): Promise<string> {
    const task = await this.queueUseCase.execute({
      description,
      source: "interactive",
    });
    return task.id;
  }

  /** キュー内のタスク一覧を取得する */
  async listTasks() {
    return this.queueUseCase.list();
  }

  /** 会話履歴を取得する */
  getHistory(): readonly ConversationMessage[] {
    return [...this.history];
  }

  /** 会話履歴を外部から追加する（セッション復元用） */
  restoreHistory(messages: ConversationMessage[]): void {
    this.history.length = 0;
    this.history.push(...messages);
  }

  /** セッションをファイルに保存する */
  async saveSession(): Promise<string> {
    const now = new Date();
    const sessionId = `${now.toISOString().slice(0, 10)}_${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
    const sessionsDir = path.join(resolveAtelierPath(this.workingDirectory), SESSIONS_DIR);
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);

    const data: SessionData = {
      id: sessionId,
      createdAt: this.history[0]?.timestamp ?? now.toISOString(),
      updatedAt: now.toISOString(),
      messages: [...this.history],
    };

    await writeTextFile(sessionPath, JSON.stringify(data, null, 2));
    return sessionPath;
  }

  /** 保存されたセッション一覧を取得する */
  static async listSessions(projectPath: string): Promise<SessionData[]> {
    const sessionsDir = path.join(resolveAtelierPath(projectPath), SESSIONS_DIR);
    const files = await listFiles(sessionsDir, ".json");

    const sessions: SessionData[] = [];
    for (const file of files.reverse()) {
      try {
        const content = await readTextFile(file);
        const data = JSON.parse(content) as SessionData;
        sessions.push(data);
      } catch {
        // 壊れたファイルはスキップ
      }
    }

    return sessions;
  }

  /** 保存されたセッションを復元する */
  static async loadSession(projectPath: string, sessionId: string): Promise<SessionData | null> {
    const sessionsDir = path.join(resolveAtelierPath(projectPath), SESSIONS_DIR);
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);

    if (!(await fileExists(sessionPath))) {
      return null;
    }

    try {
      const content = await readTextFile(sessionPath);
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  /**
   * 会話履歴を含めたプロンプトを構築する。
   * プロジェクトコンテキスト（knowledge, policy, findings）を注入し、
   * どのプロバイダーでも同じ品質の壁打ちを実現する。
   *
   * 「指示の呪い」対策（Osmani / hierarchical summarization）:
   * - 初回: Knowledge全文 + Policy全文 + 調査メソドロジー（フルコンテキスト）
   * - 2回目以降: findings（蓄積された事実）+ Policy のみ（軽量コンテキスト）
   *   Knowledge は初回で AI に取り込まれており、findings に反映されている前提
   */
  buildContextPrompt(currentMessage: string): string {
    const parts: string[] = [];
    const isFirstMessage = this.history.length <= 1;

    if (isFirstMessage) {
      // ── 初回: フルコンテキスト注入 ──

      // 1. Knowledge 全文
      if (this.knowledgeContent) {
        parts.push("## Project Knowledge");
        parts.push("以下はプロジェクト固有の技術情報です。回答時に参照してください。");
        parts.push("");
        parts.push(this.knowledgeContent);
        parts.push("");
        parts.push("---");
        parts.push("");
      }

      // 2. Policy 全文
      if (this.policyContent || this.projectPolicies) {
        parts.push("## Policy");
        parts.push("以下のポリシーは行動規範です。必ず遵守してください。");
        parts.push("");
        if (this.policyContent) {
          parts.push(this.policyContent);
          parts.push("");
        }
        if (this.projectPolicies) {
          parts.push(this.projectPolicies);
          parts.push("");
        }
        parts.push("---");
        parts.push("");
      }

      // 3. 調査メソドロジー
      parts.push("## Investigation Methodology");
      parts.push("ユーザーとの対話で仕様を壁打ちする際、以下の手順で段階的に情報を収集・整理してください。");
      parts.push("");
      parts.push("1. ユーザーの説明から対象テーブル・画面・APIを特定する");
      parts.push("2. コードベースを検索し、関連する既存実装を確認する");
      parts.push("3. DB構造（テーブル・カラム）を確認し、正確な情報を提示する");
      parts.push("4. 不明点・矛盾点を明示的に質問する");
      parts.push("5. 各回答の末尾に以下の形式で発見事項を蓄積する:");
      parts.push("");
      parts.push("```");
      parts.push("### 📋 蓄積された事実");
      parts.push("- **対象テーブル**: テーブル名とカラム構造");
      parts.push("- **入出力データ**: CSV等の形式と項目");
      parts.push("- **関連する既存実装**: ファイルパスとクラス名");
      parts.push("- **決定事項**: ユーザーが明示的に決めたこと");
      parts.push("- **未決事項**: 確認が必要な点");
      parts.push("```");
      parts.push("");
      parts.push("この蓄積セクションは会話が進むたびに更新・追加してください。");
      parts.push("以前の蓄積内容は失われないよう、全項目を維持しながら新情報を追加してください。");
      parts.push("");
      parts.push("---");
      parts.push("");

      // 4. ユーザーメッセージ
      parts.push(currentMessage);

    } else {
      // ── 2回目以降: 軽量コンテキスト ──
      // Knowledge は省略（初回で AI に取り込み済み、findings に反映されている前提）
      // Policy は簡略版で注入（命名規則等の遵守を維持）

      // 1. findings（蓄積された事実）を最優先で注入
      if (this.lastKnownFindings) {
        parts.push("## 蓄積された事実（前回までの発見事項）");
        parts.push("以下はこれまでの対話で蓄積された情報です。この内容を維持・更新してください。");
        parts.push("");
        parts.push(this.lastKnownFindings);
        parts.push("");
        parts.push("---");
        parts.push("");
      }

      // 2. Policy は簡略版（プロジェクト固有のみ）
      if (this.projectPolicies) {
        parts.push("## Policy（簡略版）");
        parts.push(this.projectPolicies);
        parts.push("");
        parts.push("---");
        parts.push("");
      }

      // 3. 会話履歴（直近10件）
      const recentHistory = this.history.slice(-11, -1);
      const contextLines = recentHistory.map(
        (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
      );

      parts.push("以下はこれまでの会話履歴です。この文脈を踏まえて回答してください。");
      parts.push("");
      parts.push(...contextLines);
      parts.push("");
      parts.push(`User: ${currentMessage}`);
    }

    // ── リマインダー ──
    parts.push("");
    parts.push("---");
    parts.push("**Reminder:** 蓄積された事実セクションを毎回更新してください。Policy の規範を遵守してください。");

    return parts.join("\n");
  }
}
