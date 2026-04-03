/**
 * Interactive Session Use Case
 * 対話モードのセッション管理。
 * 会話履歴をATELIER側で管理し、プロバイダー非依存で複数ラリーの対話を実現する。
 * セッションの永続化（保存・復元）にも対応する。
 */

import path from "node:path";
import type { MediumPort, MediumExecuteRequest, MediumExecuteResponse } from "../../domain/ports/medium.port.js";
import { QueueTaskUseCase } from "./queue-task.use-case.js";
import { DEFAULT_TIMEOUT_MS, SESSIONS_DIR, POLICIES_DIR } from "../../shared/constants.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { writeTextFile, readTextFile, listFiles, fileExists } from "../../infrastructure/fs/file-system.js";

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

  /** ユーザーメッセージを送信し、AIの応答を取得する */
  async sendMessage(userMessage: string): Promise<string> {
    this.history.push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // 会話履歴をコンテキストとして含めたプロンプトを構築
    const contextPrompt = this.buildContextPrompt(userMessage);

    const request: MediumExecuteRequest = {
      prompt: contextPrompt,
      workingDirectory: this.workingDirectory,
      allowEdit: false,
      allowReadTools: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };

    const response: MediumExecuteResponse = await this.medium.execute(request);

    this.history.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
    });

    return response.content;
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
   * 直近の会話をコンテキストとして含め、どのプロバイダーでも文脈を維持できるようにする。
   * ポリシーが読み込まれている場合はプロンプト末尾に注入する。
   */
  buildContextPrompt(currentMessage: string): string {
    const parts: string[] = [];

    // ポリシー注入
    if (this.policyContent) {
      parts.push("## Policy");
      parts.push("以下のポリシーは行動規範です。必ず遵守してください。");
      parts.push("");
      parts.push(this.policyContent);
      parts.push("");
      parts.push("---");
      parts.push("");
    }

    // 初回メッセージはそのまま
    if (this.history.length <= 1) {
      parts.push(currentMessage);
      if (this.policyContent) {
        parts.push("");
        parts.push("---");
        parts.push("**Policy Reminder:** 上記の Policy セクションで定義されたポリシー規範を遵守してください。");
      }
      return parts.join("\n");
    }

    // 直近の会話履歴（最大10件）をコンテキストとして含める
    const recentHistory = this.history.slice(-11, -1);
    const contextLines = recentHistory.map(
      (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
    );

    parts.push("以下はこれまでの会話履歴です。この文脈を踏まえて回答してください。");
    parts.push("");
    parts.push(...contextLines);
    parts.push("");
    parts.push(`User: ${currentMessage}`);

    if (this.policyContent) {
      parts.push("");
      parts.push("---");
      parts.push("**Policy Reminder:** 上記の Policy セクションで定義されたポリシー規範を遵守してください。");
    }

    return parts.join("\n");
  }
}
