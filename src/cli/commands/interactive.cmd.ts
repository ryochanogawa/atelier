/**
 * Interactive Commands
 * atelier talk - 対話モードでAIと会話し、タスクをキューに追加する。
 *
 * takt と同等の Interactive Mode:
 * /go [追加指示]  - 対話要約 → Commission 選択 → 実行
 * /play <タスク>  - 即座にタスクを default Commission で実行
 * /resume         - 過去のセッション履歴を復元
 * /requirements   - 構造化要件定義モード
 * /analyze        - 会話から要件を自動抽出
 * /save           - 会話内容を要件定義書として保存
 * /implement [name] - 要件定義を元にCommissionを実行
 * /suggest        - Commission/Palette提案
 * /exit           - 終了時アクション選択
 */

import { Command } from "commander";
import readline from "node:readline";
import path from "node:path";
import { getColorFn, printSuccess, printError, printWarning, printInfo, printTable, printRunResult, createSpinner, getCurrentTheme, isTuiMode } from "../output.js";
import { transitionIn, transitionOut, typewrite, scanlineFlash, playSound } from "../codec-effects.js";

const COLORS = {
  get accent() { return getColorFn("accent"); },
  get muted() { return getColorFn("muted"); },
  get success() { return getColorFn("success"); },
  get error() { return getColorFn("error"); },
  get warning() { return getColorFn("warning"); },
} as const;
import { parse as parseYaml } from "yaml";
import { InteractiveSessionUseCase } from "../../application/use-cases/interactive-session.use-case.js";
import { ClaudeCodeAdapter } from "../../adapters/medium/claude-code.adapter.js";
import { RequirementsAnalyzerService } from "../../domain/services/requirements-analyzer.service.js";
import { IntentEnhancerService } from "../../domain/services/intent-enhancer.service.js";
import { RequirementsStoreAdapter } from "../../adapters/config/requirements-store.adapter.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { REQUIREMENTS_DIR, COMMISSIONS_DIR } from "../../shared/constants.js";
import { writeTextFile, readTextFile, listFiles, listDirs, ensureDir } from "../../infrastructure/fs/file-system.js";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import { listBuiltinCommissions } from "../../builtin/index.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { createMediumExecutor } from "../factories/medium.factory.js";

// ── helpers ──────────────────────────────────────────────

/** readline で1行入力を取得する */
function promptLine(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * 要件定義を連番IDフォルダに保存し、IDを返す。
 * .atelier/requirements/{id}/requirements.md
 */
async function saveRequirements(content: string, projectPath: string): Promise<number> {
  const reqDir = path.join(resolveAtelierPath(projectPath), REQUIREMENTS_DIR);

  // 次の連番IDを計算
  const dirs = await listDirs(reqDir);
  const numericDirs = dirs
    .map((d) => parseInt(d, 10))
    .filter((n) => !isNaN(n));
  const nextId = numericDirs.length > 0 ? Math.max(...numericDirs) + 1 : 1;

  const filePath = path.join(reqDir, String(nextId), "requirements.md");
  await writeTextFile(filePath, content);
  return nextId;
}

/** Commission 一覧を取得する（プロジェクト固有 + ビルトイン） */
async function listAvailableCommissions(projectPath: string): Promise<{ name: string; description: string; source: string }[]> {
  const result: { name: string; description: string; source: string }[] = [];

  // プロジェクト固有の commission
  const commissionsDir = path.join(resolveAtelierPath(projectPath), COMMISSIONS_DIR);
  try {
    const files = await listFiles(commissionsDir, ".yaml");
    for (const file of files) {
      try {
        const content = await readTextFile(file);
        const parsed = parseYaml(content) as Record<string, unknown>;
        const name = (parsed.name as string) ?? path.basename(file, ".yaml");
        const desc = (parsed.description as string) ?? "-";
        result.push({ name, description: desc, source: "project" });
      } catch {
        // 壊れたファイルはスキップ
      }
    }
  } catch {
    // ディレクトリがない場合は無視
  }

  // ビルトイン commission（プロジェクト固有で上書きされていないもの）
  const projectNames = new Set(result.map((c) => c.name));
  const builtinNames = listBuiltinCommissions();
  for (const name of builtinNames) {
    if (!projectNames.has(name)) {
      result.push({ name, description: `(builtin) ${name}`, source: "builtin" });
    }
  }

  return result;
}

/** Commission 選択UI */
async function selectCommission(projectPath: string): Promise<string | null> {
  const commissions = await listAvailableCommissions(projectPath);

  console.log();
  console.log(COLORS.accent.bold("Commission を選択してください:"));
  console.log();
  commissions.forEach((c, i) => {
    const tag = c.source === "builtin" ? COLORS.muted(" (builtin)") : "";
    console.log(`  ${COLORS.accent(String(i + 1))}. ${COLORS.accent.bold(c.name)}${tag} ${COLORS.muted("—")} ${c.description}`);
  });
  console.log(`  ${COLORS.accent(String(commissions.length + 1))}. ${COLORS.muted("(直接実行)")} ${COLORS.muted("—")} Commission なしで直接AIに渡す`);
  console.log(`  ${COLORS.accent("0")}. ${COLORS.muted("キャンセル")}`);
  console.log();

  const answer = await promptLine(COLORS.accent("> "));
  const num = parseInt(answer.trim(), 10);

  if (num === 0 || isNaN(num)) {
    return null;
  }

  if (num === commissions.length + 1) {
    return "__direct__";
  }

  if (num >= 1 && num <= commissions.length) {
    return commissions[num - 1]!.name;
  }

  printWarning("無効な選択です。");
  return null;
}

/** 対話終了時のアクション選択 */
async function selectExitAction(): Promise<"go" | "save_task" | "save_requirements" | "exit"> {
  console.log();
  console.log(COLORS.accent.bold("次のアクションを選択してください:"));
  console.log();
  console.log(`  ${COLORS.accent("1")}. ${COLORS.accent.bold("実行する")} ${COLORS.muted("—")} 会話を要約して Commission を実行`);
  console.log(`  ${COLORS.accent("2")}. ${COLORS.accent.bold("タスクとして保存")} ${COLORS.muted("—")} タスクキューに追加`);
  console.log(`  ${COLORS.accent("3")}. ${COLORS.accent.bold("要件定義書として保存")} ${COLORS.muted("—")} Markdown ファイルに保存`);
  console.log(`  ${COLORS.accent("4")}. ${COLORS.accent.bold("終了")} ${COLORS.muted("—")} 何もせず終了`);
  console.log();

  const answer = await promptLine(COLORS.accent("> "));
  const num = parseInt(answer.trim(), 10);

  switch (num) {
    case 1: return "go";
    case 2: return "save_task";
    case 3: return "save_requirements";
    default: return "exit";
  }
}

// ── Commission 実行インフラ構築 ──────────────────────────

async function buildCommissionInfra(projectPath: string) {
  const { readTextFile: readText, fileExists: fExists } = await import("../../infrastructure/fs/file-system.js");
  const { STUDIO_CONFIG_FILE } = await import("../../shared/constants.js");
  const { simpleGit } = await import("simple-git");

  const configPort = {
    async loadStudioConfig(pp: string) {
      const cfgPath = path.join(resolveAtelierPath(pp), STUDIO_CONFIG_FILE);
      if (!(await fExists(cfgPath))) {
        return { defaultMedium: "claude-code", language: "ja", logLevel: "info" as const };
      }
      const content = await readText(cfgPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const studio = parsed.studio as Record<string, unknown>;

      // palette_providers の読み込み
      const rawPaletteProviders = (parsed.palette_providers ?? {}) as Record<string, Record<string, unknown>>;
      const paletteProviders: Record<string, { medium?: string; model?: string }> = {};
      for (const [name, config] of Object.entries(rawPaletteProviders)) {
        paletteProviders[name] = {
          medium: config.medium as string | undefined,
          model: config.model as string | undefined,
        };
      }

      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as "info") ?? "info",
        ...(Object.keys(paletteProviders).length > 0 ? { paletteProviders } : {}),
      };
    },
    async loadMediaConfig(pp: string) {
      const cfgPath = path.join(resolveAtelierPath(pp), STUDIO_CONFIG_FILE);
      if (!(await fExists(cfgPath))) {
        const { DEFAULT_MEDIA: dm } = await import("../../shared/constants.js");
        return dm;
      }
      const content = await readText(cfgPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const media = (parsed.media ?? {}) as Record<string, Record<string, unknown>>;
      const result: Record<string, { command: string; args: string[] }> = {};
      for (const [n, c] of Object.entries(media)) {
        result[n] = { command: (c.command as string) ?? n, args: (c.args as string[]) ?? [] };
      }
      return result;
    },
  };

  const mediumExecutor = createMediumExecutor();

  const vcsPort = {
    async createWorktree(basePath: string, branchName: string) {
      const git = simpleGit(basePath);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) return basePath;

      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
      const branches = await git.branchLocal();
      if (!branches.all.includes(branchName)) {
        await git.checkoutLocalBranch(branchName);
        await git.checkout(currentBranch);
      }

      const safeName = branchName.replace(/\//g, "-");
      const worktreePath = path.join(basePath, ".atelier", "worktrees", safeName);

      try {
        const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
        if (worktreeList.includes(worktreePath)) return worktreePath;
      } catch { /* ignore */ }

      await git.raw(["worktree", "add", worktreePath, branchName]);
      return worktreePath;
    },
    async removeWorktree(_w: string) {
      // worktree を保持する
    },
    async commitAll(cwd: string, message: string) {
      const git = simpleGit(cwd);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) return;
      const status = await git.status();
      if (status.files.length === 0) return;
      await git.add("-A");
      await git.commit(message);
    },
  };

  const loggerPort = {
    info: () => {},
    warn: () => {},
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    debug: () => {},
  };

  return { configPort, mediumExecutor, vcsPort, loggerPort };
}

/** Spec用 Commission を実行する（worktree なし、spec_dir を canvas に渡す） */
async function executeSpecCommission(
  projectPath: string,
  commissionName: string,
  description: string,
  specDirName: string,
): Promise<void> {
  const { configPort, mediumExecutor, loggerPort } = await buildCommissionInfra(projectPath);
  const noopVcsPort = {
    async createWorktree(basePath: string, _branchName: string) { return basePath; },
    async removeWorktree(_w: string) {},
    async commitAll(_cwd: string, _message: string) {},
  };
  const eventBus = createEventBus();
  const useCase = new CommissionRunUseCase(configPort, noopVcsPort, loggerPort, mediumExecutor, eventBus);

  const execSpinner = createSpinner(`Commission '${commissionName}' を実行中...`).start();

  try {
    const result = await useCase.execute(commissionName, projectPath, {
      dryRun: false,
      initialCanvas: { requirements: description, spec_dir: specDirName },
    });

    execSpinner.stop();
    printRunResult(result);
  } catch (error) {
    execSpinner.fail(`Commission '${commissionName}' の実行に失敗しました`);
    printError(error instanceof Error ? error.message : String(error));
  }
}

/** Commission を実行して結果を表示する */
async function executeCommission(
  projectPath: string,
  commissionName: string,
  requirements: string,
): Promise<void> {
  const { configPort, mediumExecutor, vcsPort, loggerPort } = await buildCommissionInfra(projectPath);
  const eventBus = createEventBus();
  const useCase = new CommissionRunUseCase(configPort, vcsPort, loggerPort, mediumExecutor, eventBus);

  const execSpinner = createSpinner(`Commission '${commissionName}' を実行中...`).start();

  try {
    const result = await useCase.execute(commissionName, projectPath, {
      dryRun: false,
      initialCanvas: { requirements },
    });

    execSpinner.stop();
    printRunResult(result);

    // worktree 情報を表示
    const branchName = `atelier/${result.runId}`;
    const safeName = branchName.replace(/\//g, "-");
    const worktreePath = path.join(projectPath, ".atelier", "worktrees", safeName);

    let worktreeCreated = false;
    try {
      const { simpleGit } = await import("simple-git");
      const git = simpleGit(projectPath);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (isRepo) {
        const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
        worktreeCreated = worktreeList.includes(worktreePath);
      }
    } catch { /* ignore */ }

    if (worktreeCreated) {
      console.log();
      printInfo(`ブランチ: ${branchName}`);
      printInfo(`Worktree: .atelier/worktrees/${safeName}`);
      console.log();
      printInfo("次のステップ:");
      console.log(`    atelier branch merge ${branchName}     # メインにマージ`);
      console.log(`    atelier branch delete ${branchName}    # 削除`);
      console.log(`    atelier branch instruct ${branchName}  # 追加指示`);
      console.log();
    } else {
      try {
        const { execa } = await import("execa");
        const gitResult = await execa("git", ["status", "--short"], { cwd: projectPath, reject: false });
        if (gitResult.stdout.trim()) {
          printInfo("変更されたファイル:");
          console.log(gitResult.stdout);
          console.log();
        } else {
          printWarning("ファイルの変更はありませんでした。");
          console.log();
        }
      } catch { /* ignore */ }
    }
  } catch (error) {
    execSpinner.fail("Commission の実行に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
    console.log();
  }
}

// ── /go コマンド: 対話要約 → Commission 選択 → 実行 ──────

async function handleGoCommand(
  session: InteractiveSessionUseCase,
  additionalNote?: string,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  // Step 1: AIに会話を要約させてタスク文字列を生成
  const spinner = createSpinner("タスク指示書を生成中...").start();

  let taskText: string;
  try {
    taskText = await session.summarizeForTask(additionalNote);
    spinner.stop();

    console.log();
    console.log(COLORS.accent.bold("--- 生成されたタスク指示書 ---"));
    console.log();
    console.log(COLORS.success("ai > ") + taskText);
    console.log();
  } catch (error) {
    spinner.fail("タスク指示書の生成に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
    return;
  }

  // Step 2: Commission 選択UI
  const projectPath = process.cwd();
  const selectedCommission = await selectCommission(projectPath);

  if (selectedCommission === null) {
    printInfo("キャンセルしました。");
    console.log();
    return;
  }

  // Step 3: 要件定義をファイルに保存（連番IDフォルダ方式）
  let reqId: number;
  try {
    reqId = await saveRequirements(taskText, projectPath);
    printSuccess(`タスク指示書を保存しました: #${reqId}`);
  } catch (error) {
    printError(`保存に失敗: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Step 4: 直接実行の場合はAIに直接渡す（Commission なし）
  if (selectedCommission === "__direct__") {
    printInfo("AIに直接タスクを渡して実行します...");
    const directSpinner = createSpinner("実行中...").start();
    try {
      const response = await session.sendMessage(
        `以下のタスクを実行してください:\n\n${taskText}`,
      );
      directSpinner.stop();
      console.log();
      console.log(COLORS.success("ai > ") + response);
      console.log();
    } catch (error) {
      directSpinner.fail("実行に失敗しました");
      printError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // Step 5: Commission を実行
  await executeCommission(projectPath, selectedCommission, taskText);
}

// ── /play コマンド: 即座にタスク実行 ──────────────────────

async function handlePlayCommand(
  taskDescription: string,
): Promise<void> {
  if (!taskDescription.trim()) {
    printWarning("タスク説明を入力してください: /play <タスク説明>");
    console.log();
    return;
  }

  const projectPath = process.cwd();

  printInfo(`default Commission でタスクを実行します: ${taskDescription.slice(0, 80)}...`);
  console.log();

  await executeCommission(projectPath, "default", taskDescription);
}

// ── /resume コマンド: 過去のセッション履歴を復元 ──────────

async function handleResumeCommand(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const projectPath = process.cwd();

  const sessions = await InteractiveSessionUseCase.listSessions(projectPath);

  if (sessions.length === 0) {
    printWarning("保存されたセッションがありません。");
    console.log();
    return;
  }

  console.log();
  console.log(COLORS.accent.bold("セッションを選択してください:"));
  console.log();

  const maxDisplay = Math.min(sessions.length, 10);
  for (let i = 0; i < maxDisplay; i++) {
    const s = sessions[i]!;
    const messageCount = s.messages.length;
    const firstMsg = s.messages[0]?.content.slice(0, 60) ?? "(空)";
    const date = s.updatedAt.slice(0, 19).replace("T", " ");
    console.log(`  ${COLORS.accent(String(i + 1))}. ${COLORS.muted(date)} ${COLORS.muted(`(${messageCount}件)`)} ${firstMsg}...`);
  }
  console.log(`  ${COLORS.accent("0")}. キャンセル`);
  console.log();

  const answer = await promptLine(COLORS.accent("> "));
  const num = parseInt(answer.trim(), 10);

  if (num === 0 || isNaN(num) || num > maxDisplay) {
    printInfo("キャンセルしました。");
    return;
  }

  const selected = sessions[num - 1]!;
  session.restoreHistory(selected.messages);

  printSuccess(`セッション (${selected.id}) を復元しました。(${selected.messages.length}件の会話)`);
  console.log();

  // 直近の会話を表示
  const recentMessages = selected.messages.slice(-4);
  for (const msg of recentMessages) {
    const prefix = msg.role === "user" ? COLORS.accent("you > ") : COLORS.success("ai > ");
    const content = msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content;
    console.log(prefix + content);
    console.log();
  }
}

// ── 既存コマンド: /requirements ──────────────────────────

async function handleRequirementsMode(
  session: InteractiveSessionUseCase,
): Promise<void> {
  console.log();
  console.log(COLORS.accent.bold("--- 構造化要件定義モード ---"));
  console.log(COLORS.muted("AIが質問形式で要件をヒアリングします。"));
  console.log(COLORS.muted("回答を入力してください。「/done」で要件を確定します。"));
  console.log();

  const interviewPrompt = [
    "あなたは要件ヒアリングの専門家です。",
    "ユーザーに対して段階的に質問を行い、要件を引き出してください。",
    "まず最初に、プロジェクトの目的とゴールについて2-3個の質問をしてください。",
    "質問は日本語で、分かりやすく簡潔に行ってください。",
  ].join("\n");

  const spinner = createSpinner("質問を準備中...").start();
  try {
    const response = await session.sendMessage(interviewPrompt);
    spinner.stop();
    console.log(COLORS.success("ai > ") + response);
    console.log();
    printInfo("回答を入力してください。要件定義が完了したら /done と入力してください。");
    console.log();
  } catch (error) {
    spinner.fail("質問の準備に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
  }
}

// ── 既存コマンド: /analyze ────────────────────────────────

async function handleAnalyzeConversation(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  const allMessages = history
    .map((msg) => msg.content)
    .join("\n");

  const analyzer = new RequirementsAnalyzerService();
  const doc = analyzer.analyzeRequirements(allMessages);

  console.log();
  console.log(COLORS.accent.bold(`--- 要件分析結果: ${doc.title} ---`));
  console.log();

  if (doc.functional.length > 0) {
    printSuccess(`機能要件 (${doc.functional.length}件):`);
    const funcRows = doc.functional.map((r) => [
      r.id,
      r.description.slice(0, 60),
      r.priority.toUpperCase(),
      r.category,
    ]);
    printTable(["ID", "Description", "Priority", "Category"], funcRows);
    console.log();
  }

  if (doc.nonFunctional.length > 0) {
    printSuccess(`非機能要件 (${doc.nonFunctional.length}件):`);
    const nfRows = doc.nonFunctional.map((r) => [
      r.id,
      r.description.slice(0, 60),
      r.priority.toUpperCase(),
      r.category,
    ]);
    printTable(["ID", "Description", "Priority", "Category"], nfRows);
    console.log();
  }

  const allReqs = [...doc.functional, ...doc.nonFunctional];
  const contradictions = analyzer.detectContradictions(allReqs);
  if (contradictions.length > 0) {
    printWarning(`矛盾検出 (${contradictions.length}件):`);
    for (const c of contradictions) {
      const icon = c.severity === "error" ? COLORS.error("[ERROR]") : COLORS.warning("[WARN]");
      console.log(`  ${icon} ${c.requirementIds.join(" <-> ")}: ${c.reason}`);
    }
    console.log();
  }

  const gaps = analyzer.detectGaps(allReqs);
  if (gaps.length > 0) {
    printWarning(`抜け漏れ検出 (${gaps.length}件):`);
    for (const g of gaps) {
      console.log(`  ${COLORS.warning("-")} [${g.category}] ${g.description}`);
      console.log(`    ${COLORS.muted("提案: " + g.suggestion)}`);
    }
    console.log();
  }

  const checklist = analyzer.generateChecklist(allReqs);
  printInfo(`確認チェックリスト (${checklist.items.length}件):`);
  for (const item of checklist.items) {
    const mark = item.required ? COLORS.error("*") : COLORS.muted("o");
    console.log(`  ${mark} [${item.category}] ${item.question}`);
  }
  console.log();

  if (doc.assumptions.length > 0) {
    printInfo("前提条件:");
    for (const a of doc.assumptions) {
      console.log(`  - ${a}`);
    }
    console.log();
  }

  if (doc.openQuestions.length > 0) {
    printInfo("未確定事項:");
    for (const q of doc.openQuestions) {
      console.log(`  ? ${q}`);
    }
    console.log();
  }

  try {
    const store = new RequirementsStoreAdapter(process.cwd());
    const reqId = await store.save({
      document: doc,
      contradictions,
      gaps,
      checklist,
    });
    printSuccess(`要件定義書を保存しました: #${reqId}`);
    console.log();
  } catch (error) {
    printError(
      `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log();
  }
}

// ── 既存コマンド: /implement ──────────────────────────────

async function handleImplement(
  session: InteractiveSessionUseCase,
  commissionName: string,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと要件を話し合ってください。");
    console.log();
    return;
  }

  // Step 1: AIに要件定義をまとめさせる
  const spinner = createSpinner("要件定義を生成中...").start();

  let requirements: string;
  try {
    const summarizePrompt = [
      "これまでの会話内容を元に、実装に必要な要件定義を簡潔にまとめてください。",
      "以下の構成で出力してください:",
      "",
      "## 概要",
      "## 実装すべき機能（優先度順）",
      "## 技術的な制約・方針",
      "## 受け入れ基準",
      "",
      "Markdown形式で、装飾的な説明は省いて本文のみ出力してください。",
    ].join("\n");

    requirements = await session.sendMessage(summarizePrompt);
    spinner.stop();

    console.log();
    console.log(COLORS.success("ai > ") + requirements);
    console.log();
  } catch (error) {
    spinner.fail("要件定義の生成に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
    return;
  }

  // Step 2: 要件定義をファイルに保存（連番IDフォルダ方式）
  const projectPath = process.cwd();
  let reqId: number;
  try {
    reqId = await saveRequirements(requirements, projectPath);
    printSuccess(`要件定義書を保存しました: #${reqId}`);
  } catch (error) {
    printError(`保存に失敗: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Step 3: 確認プロンプト
  console.log();
  printInfo(`Commission '${commissionName}' を実行して実装に進みます。`);

  const answer = await promptLine(COLORS.accent("実行しますか？ (y/n) > "));

  if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
    printInfo("キャンセルしました。要件定義書は保存済みです。");
    printInfo(`後から実行: atelier commission run ${commissionName}`);
    console.log();
    return;
  }

  // Step 4: Commission を実行
  await executeCommission(projectPath, commissionName, requirements);
}

// ── 既存コマンド: /save ───────────────────────────────────

async function handleSaveConversation(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  const spinner = createSpinner("要件定義書を生成中...").start();

  try {
    const summarizePrompt = [
      "これまでの会話内容を元に、要件定義書をMarkdown形式で出力してください。",
      "以下の構成で記述してください:",
      "",
      "# プロジェクト名",
      "## 概要",
      "## 機能要件",
      "## 非機能要件",
      "## 前提条件・制約",
      "## 未確定事項",
      "",
      "各要件には優先度（MUST/SHOULD/COULD）を付けてください。",
      "Markdown以外の装飾や説明は不要です。要件定義書の本文だけを出力してください。",
    ].join("\n");

    const content = await session.sendMessage(summarizePrompt);
    spinner.stop();

    const reqId = await saveRequirements(content, process.cwd());

    console.log();
    console.log(COLORS.success("ai > ") + content);
    console.log();
    printSuccess(`要件定義書を保存しました: #${reqId}`);
    console.log();
  } catch (error) {
    spinner.fail("要件定義書の生成に失敗しました");
    printError(
      error instanceof Error ? error.message : String(error),
    );
    console.log();
  }
}

// ── 既存コマンド: /suggest ────────────────────────────────

function handleSuggest(
  session: InteractiveSessionUseCase,
): void {
  const history = session.getHistory();
  const enhancer = new IntentEnhancerService();

  let taskDescription: string;
  if (history.length > 0) {
    const recentMessages = history
      .slice(-5)
      .filter((msg) => msg.role === "user")
      .map((msg) => msg.content)
      .join(" ");
    taskDescription = recentMessages;
  } else {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  console.log();
  console.log(COLORS.accent.bold("--- 推奨提案 ---"));
  console.log();

  const paletteSuggestions = enhancer.suggestPalette(taskDescription);
  if (paletteSuggestions.length > 0) {
    printSuccess("推奨Palette:");
    const pRows = paletteSuggestions.map((s) => [
      s.name,
      `${Math.round(s.score * 100)}%`,
      s.description,
    ]);
    printTable(["Name", "Score", "Description"], pRows);
    console.log();
  }

  const commissionSuggestions = enhancer.suggestCommission(taskDescription);
  if (commissionSuggestions.length > 0) {
    printSuccess("推奨Commission:");
    const cRows = commissionSuggestions.map((s) => [
      s.name,
      `${Math.round(s.score * 100)}%`,
      s.description,
    ]);
    printTable(["Name", "Score", "Description"], cRows);
    console.log();
  }

  const enhanced = enhancer.enhance(taskDescription);
  if (enhanced.addedContexts.length > 0) {
    printInfo(`プロンプト強化提案 (${enhanced.addedContexts.length}件):`);
    for (const ctx of enhanced.addedContexts) {
      console.log(
        `  ${COLORS.warning("+")} [${COLORS.accent.bold(ctx.category)}] ${ctx.content}`,
      );
    }
    console.log();
  }
}

// ── /spec コマンド用ヘルパー ──────────────────────────────

/** spec ディレクトリのパスを返す */
function specsDirPath(projectPath: string): string {
  return path.join(resolveAtelierPath(projectPath), "specs");
}

/** 説明文からスラッグを生成する */
function toSpecSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

/** 次の Spec ID を取得する */
async function nextSpecId(projectPath: string): Promise<number> {
  const dir = specsDirPath(projectPath);
  try {
    const entries = await listDirs(dir);
    const ids = entries
      .map((e) => parseInt(path.basename(e), 10))
      .filter((n) => !isNaN(n));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  } catch {
    return 1;
  }
}

/** spec.json を保存する */
async function saveSpecJson(
  specDir: string,
  spec: { id: number; name: string; description: string; phase: string; createdAt: string; updatedAt: string },
): Promise<void> {
  spec.updatedAt = new Date().toISOString();
  await writeTextFile(path.join(specDir, "spec.json"), JSON.stringify(spec, null, 2));
}

// ── /spec コマンド: 仕様書3点セット生成 ──────────────────

async function handleSpec(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  // Step 1: AIに会話を要約させて仕様説明を生成
  const spinner = createSpinner("会話を要約中...").start();

  let description: string;
  try {
    const summarizePrompt = [
      "これまでの会話内容を1〜2文の簡潔な日本語で要約してください。",
      "仕様書のタイトルや機能概要として使えるよう、装飾なしのプレーンテキストで出力してください。",
    ].join("\n");
    description = await session.sendMessage(summarizePrompt);
    description = description.trim();
    spinner.stop();

    console.log();
    printInfo(`仕様説明: ${description}`);
    console.log();
  } catch (error) {
    spinner.fail("要約の生成に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
    return;
  }

  // Step 2: spec ディレクトリを作成し spec.json を保存
  const projectPath = process.cwd();
  let specDirName: string;
  let specDir: string;
  let specId: number;

  try {
    specId = await nextSpecId(projectPath);
    const slug = toSpecSlug(description);
    specDirName = `${specId}-${slug}`;
    specDir = path.join(specsDirPath(projectPath), specDirName);
    await ensureDir(specDir);

    const specData = {
      id: specId,
      name: slug,
      description,
      phase: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveSpecJson(specDir, specData);
  } catch (error) {
    printError(`Spec ディレクトリの作成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Step 3: spec-plan Commission で requirements → design → tasks を実行（実装は含まない）
  // 仕様書生成はworktree不要 — プロジェクト直下の .atelier/specs/ に直接書き出す
  printInfo("spec-plan Commission を実行中 (requirements → design → tasks)...");
  console.log();

  await executeSpecCommission(projectPath, "spec-plan", description, specDirName);

  printSuccess(`✓ 仕様書を生成しました: .atelier/specs/${specDirName}/`);
  console.log();
}

// ── /spec implement コマンド: 仕様書生成 + 実装 ─────────

async function handleSpecImplement(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  // Step 1: AIに会話を要約させて仕様説明を生成
  const spinner = createSpinner("会話を要約中...").start();

  let description: string;
  try {
    const summarizePrompt = [
      "これまでの会話内容を1〜2文の簡潔な日本語で要約してください。",
      "仕様書のタイトルや機能概要として使えるよう、装飾なしのプレーンテキストで出力してください。",
    ].join("\n");
    description = await session.sendMessage(summarizePrompt);
    description = description.trim();
    spinner.stop();

    console.log();
    printInfo(`仕様説明: ${description}`);
    console.log();
  } catch (error) {
    spinner.fail("要約の生成に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
    return;
  }

  // Step 2: spec ディレクトリを作成し spec.json を保存
  const projectPath = process.cwd();
  let specDirName: string;
  let specDir: string;
  let specId: number;

  try {
    specId = await nextSpecId(projectPath);
    const slug = toSpecSlug(description);
    specDirName = `${specId}-${slug}`;
    specDir = path.join(specsDirPath(projectPath), specDirName);
    await ensureDir(specDir);

    const specData = {
      id: specId,
      name: slug,
      description,
      phase: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveSpecJson(specDir, specData);
  } catch (error) {
    printError(`Spec ディレクトリの作成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Step 3: spec-plan で仕様書3点セット生成（worktree なし）
  printInfo("spec-plan Commission を実行中 (requirements → design → tasks)...");
  console.log();

  await executeSpecCommission(projectPath, "spec-plan", description, specDirName);

  printSuccess(`✓ 仕様書を生成しました: .atelier/specs/${specDirName}/`);
  console.log();

  // Step 4: default Commission で実装（worktree あり）
  printInfo("default Commission を実行中 (plan → implement → review)...");
  console.log();

  await executeCommission(projectPath, "default", description);

  printSuccess(`✓ 実装が完了しました`);
  console.log();
}

// ── 特殊コマンドハンドラ ──────────────────────────────────

async function handleSpecialCommand(
  input: string,
  session: InteractiveSessionUseCase,
): Promise<string | boolean> {
  const parts = input.split(/\s+/);
  const command = parts[0];

  switch (command) {
    case "/exit": {
      // 対話終了時のアクション選択
      const history = session.getHistory();
      if (history.length > 0) {
        const action = await selectExitAction();
        switch (action) {
          case "go":
            await handleGoCommand(session);
            break;
          case "save_task": {
            // AIに要約させてタスクキューに追加
            const spinner = createSpinner("タスクを要約中...").start();
            try {
              const taskSummary = await session.summarizeForTask();
              spinner.stop();
              const taskId = await session.queueTask(taskSummary);
              printSuccess(`タスクをキューに追加しました: ${taskId}`);
            } catch (error) {
              spinner.fail("タスクの要約に失敗しました");
              printError(error instanceof Error ? error.message : String(error));
            }
            break;
          }
          case "save_requirements":
            await handleSaveConversation(session);
            break;
          case "exit":
            break;
        }
      }
      // セッションを自動保存
      if (session.getHistory().length > 0) {
        try {
          const savedPath = await session.saveSession();
          printInfo(`セッションを保存しました: ${savedPath}`);
        } catch {
          // 保存失敗は警告のみ
        }
      }
      return "exit";
    }

    case "/go": {
      const additionalNote = parts.slice(1).join(" ").trim() || undefined;
      await handleGoCommand(session, additionalNote);
      return true;
    }

    case "/play": {
      const taskDescription = parts.slice(1).join(" ").trim();
      await handlePlayCommand(taskDescription);
      return true;
    }

    case "/resume": {
      await handleResumeCommand(session);
      return true;
    }

    case "/queue": {
      const description = parts.slice(1).join(" ").trim();
      if (!description) {
        printWarning("説明を入力してください: /queue <description>");
        return true;
      }

      try {
        const taskId = await session.queueTask(description);
        printSuccess(`タスクをキューに追加しました: ${taskId}`);
        printInfo(`  説明: ${description}`);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
      }
      console.log();
      return true;
    }

    case "/list": {
      try {
        const tasks = await session.listTasks();

        if (tasks.length === 0) {
          printWarning("キューにタスクがありません");
        } else {
          const rows = tasks.map((t) => [
            t.id,
            t.description,
            t.status,
            t.source,
          ]);
          printTable(["ID", "Description", "Status", "Source"], rows);
        }
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
      }
      console.log();
      return true;
    }

    case "/run": {
      printInfo("キュー内のタスク実行は 'atelier task run' コマンドで行ってください。");
      console.log();
      return true;
    }

    case "/requirements": {
      await handleRequirementsMode(session);
      return true;
    }

    case "/analyze": {
      await handleAnalyzeConversation(session);
      return true;
    }

    case "/save": {
      await handleSaveConversation(session);
      return true;
    }

    case "/implement": {
      const commissionName = parts[1] ?? "default";
      await handleImplement(session, commissionName);
      return true;
    }

    case "/suggest": {
      handleSuggest(session);
      return true;
    }

    case "/spec": {
      const subCmd = parts[1];
      if (subCmd === "implement") {
        await handleSpecImplement(session);
      } else {
        await handleSpec(session);
      }
      return true;
    }

    case "/help": {
      printCommandHelp();
      return true;
    }

    default: {
      printWarning(`不明なコマンド: ${command}`);
      printInfo("利用可能なコマンドは /help で確認できます。");
      return true;
    }
  }
}

/** コマンドヘルプを表示する */
function printCommandHelp(): void {
  console.log();
  console.log(COLORS.accent.bold("利用可能なコマンド:"));
  console.log(COLORS.muted("─".repeat(60)));
  console.log();
  console.log(COLORS.accent.bold("  実行系:"));
  console.log(COLORS.muted("  /go [追加指示]     ") + "対話を要約 → Commission 選択 → 実行");
  console.log(COLORS.muted("  /play <タスク>     ") + "即座に default Commission でタスク実行");
  console.log(COLORS.muted("  /implement [name]  ") + "要件定義を元に Commission を実行");
  console.log(COLORS.muted("  /spec              ") + "会話を要約して仕様書3点セット生成 (requirements/design/tasks)");
  console.log(COLORS.muted("  /spec implement    ") + "仕様書生成 + そのまま実装・テスト・レビューまで実行");
  console.log();
  console.log(COLORS.accent.bold("  セッション:"));
  console.log(COLORS.muted("  /resume            ") + "過去のセッション履歴を復元");
  console.log();
  console.log(COLORS.accent.bold("  要件定義:"));
  console.log(COLORS.muted("  /requirements      ") + "構造化要件定義モード");
  console.log(COLORS.muted("  /analyze           ") + "会話から要件を自動抽出");
  console.log(COLORS.muted("  /save              ") + "会話内容を要件定義書として保存");
  console.log(COLORS.muted("  /suggest           ") + "Commission/Palette 提案");
  console.log();
  console.log(COLORS.accent.bold("  タスクキュー:"));
  console.log(COLORS.muted("  /queue <desc>      ") + "タスクをキューに追加");
  console.log(COLORS.muted("  /list              ") + "キュー内タスク一覧");
  console.log(COLORS.muted("  /run               ") + "キュー内タスクを実行");
  console.log();
  console.log(COLORS.accent.bold("  その他:"));
  console.log(COLORS.muted("  /help              ") + "このヘルプを表示");
  console.log(COLORS.muted("  /exit              ") + "終了（アクション選択あり）");
  console.log();
}

// ── メインループ ──────────────────────────────────────────

/** テーマが CODEC レイアウトかどうか */
function isCodecLayout(): boolean {
  const theme = getCurrentTheme();
  return theme.layout?.preset === "codec" && isTuiMode();
}

/** CODEC 風の開始画面を表示 */
async function showCodecOpening(): Promise<void> {
  const theme = getCurrentTheme();
  const { colors, borders, layout, symbols } = theme;
  const chalk = (await import("chalk")).default;

  const c = {
    primary: chalk.hex(colors.primary),
    accent: chalk.hex(colors.accent),
    muted: chalk.hex(colors.muted),
    text: chalk.hex(colors.text),
    secondary: chalk.hex(colors.secondary).bgHex(colors.secondary),
  };

  // 着信音 & トランジション
  await transitionIn(theme);
  playSound(theme.sounds?.connect);

  const innerW = Math.min((process.stdout.columns ?? 80) - 4, 60);
  const hBar = borders.horizontal.repeat(innerW);

  // ═══ CODEC ヘッダー ═══
  const label = layout?.header?.label ?? "CODEC";
  const freq = layout?.header?.frequency ?? "141.12";
  console.log(c.primary(`${borders.topLeft}${hBar}${borders.topRight}`));
  // 左: CALL / 中央: CODEC / 右: 周波数
  const callTag = `${symbols.brand} CALL`;
  const freqTag = freq;
  const centerSpace = Math.max(0, innerW - callTag.length - label.length - freqTag.length - 4);
  const leftPad = Math.floor(centerSpace / 2);
  const rightPad = centerSpace - leftPad;
  console.log(
    c.primary(borders.vertical)
    + c.accent(` ${callTag}`)
    + " ".repeat(leftPad)
    + c.primary.bold(` ${label} `)
    + " ".repeat(rightPad)
    + c.accent(`${freqTag} `)
    + c.primary(borders.vertical),
  );
  console.log(c.primary(`${borders.bottomLeft}${hBar}${borders.bottomRight}`));
  console.log();

  // ═══ ポートレートパネル ═══
  const userPanel = layout?.userPanel;
  const aiPanel = layout?.assistantPanel;
  if (userPanel?.avatar && aiPanel?.avatar) {
    const gap = Math.max(4, innerW - (userPanel.avatar.width + aiPanel.avatar.width));
    const maxLines = Math.max(userPanel.avatar.height, aiPanel.avatar.height);
    for (let i = 0; i < maxLines; i++) {
      const left = userPanel.avatar.lines[i] ?? " ".repeat(userPanel.avatar.width);
      const right = aiPanel.avatar.lines[i] ?? " ".repeat(aiPanel.avatar.width);
      console.log(c.accent(left) + " ".repeat(gap) + c.primary(right));
    }

    // 名前ラベル（ポートレート下、中央揃え）
    const leftName = userPanel.name.padStart(
      Math.floor((userPanel.avatar.width + userPanel.name.length) / 2),
    ).padEnd(userPanel.avatar.width);
    const rightName = aiPanel.name.padStart(
      Math.floor((aiPanel.avatar.width + aiPanel.name.length) / 2),
    ).padEnd(aiPanel.avatar.width);
    console.log(c.accent.bold(leftName) + " ".repeat(gap) + c.primary.bold(rightName));
    console.log();
  }

  // ═══ ステータスバー ═══
  const sigLabel = " SIGNAL ACTIVE ";
  const helpLabel = " /help ";
  const dotCount = Math.max(0, innerW - sigLabel.length - helpLabel.length - 6);
  const dots = "·".repeat(dotCount);
  console.log(c.muted(`───${sigLabel}${dots}${helpLabel}───`));
  console.log();
}

/** CODEC 風の終了画面を表示 */
async function showCodecClosing(): Promise<void> {
  const theme = getCurrentTheme();
  const chalk = (await import("chalk")).default;
  const primary = chalk.hex(theme.colors.primary);
  const muted = chalk.hex(theme.colors.muted);

  playSound(theme.sounds?.disconnect);
  await transitionOut(theme);

  const innerW = Math.min((process.stdout.columns ?? 80) - 4, 60);
  const endMsg = " TRANSMISSION ENDED ";
  const padTotal = Math.max(0, innerW - endMsg.length);
  const lPad = Math.floor(padTotal / 2);
  const rPad = padTotal - lPad;
  console.log(muted("─".repeat(lPad)) + primary.bold(endMsg) + muted("─".repeat(rPad)));
}

/** CODEC 風にユーザーメッセージを表示 */
async function showCodecUserMessage(text: string): Promise<void> {
  const theme = getCurrentTheme();
  const chalk = (await import("chalk")).default;
  const { colors } = theme;
  const userName = theme.layout?.userPanel?.name ?? "SNAKE";

  const innerW = Math.min((process.stdout.columns ?? 80) - 2, 60);
  console.log(chalk.hex(colors.muted)("─".repeat(innerW)));
  console.log(chalk.hex(colors.accent).bold(`${userName}:`));
  console.log(chalk.hex(colors.text)(`  "${text}"`));
}

/** CODEC 風に AI レスポンスを表示（タイプライター） */
async function showCodecAiResponse(text: string): Promise<void> {
  const theme = getCurrentTheme();
  const chalk = (await import("chalk")).default;
  const { colors } = theme;
  const aiName = theme.layout?.assistantPanel?.name ?? "ATELIER";

  await scanlineFlash(theme);
  playSound(theme.sounds?.messageReceive);

  console.log(chalk.hex(colors.primary).bold(`${aiName}:`));

  // タイプライター効果で出力（raw stdout なので ANSI カラーコードを直接使用）
  const open = `\x1b[38;2;${hexToRgb(colors.text)}m`;
  const close = "\x1b[0m";

  process.stdout.write(open + "  ");
  await typewrite(text, theme.animations?.typewriter);
  process.stdout.write(close + "\n");

  const innerW = Math.min((process.stdout.columns ?? 80) - 2, 60);
  console.log(chalk.hex(colors.muted)("─".repeat(innerW)));
}

/** hex カラーを "r;g;b" 形式に変換 */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r};${g};${b}`;
}

async function startInteractiveLoop(
  session: InteractiveSessionUseCase,
): Promise<void> {
  // stdinが閉じないようにrefを保持
  process.stdin.ref();

  const codec = isCodecLayout();

  if (codec) {
    // ── CODEC 通信画面 ──
    await showCodecOpening();
  } else {
    // ── 従来モード ──
    console.log();
    console.log(COLORS.accent.bold("ATELIER Interactive Mode"));
    console.log(COLORS.muted("─".repeat(50)));
    console.log(COLORS.muted("対話モードを開始しました。AIに質問や指示を入力してください。"));
    console.log(COLORS.muted("コマンド一覧: /help"));
    console.log(COLORS.muted("主要コマンド:"));
    console.log(COLORS.muted("  /go [追加指示]  - 対話を要約 → Commission 選択 → 実行"));
    console.log(COLORS.muted("  /play <タスク>  - 即座にタスク実行"));
    console.log(COLORS.muted("  /spec           - 仕様書3点セット生成"));
    console.log(COLORS.muted("  /resume         - 過去のセッションを復元"));
    console.log(COLORS.muted("  /exit           - 終了（アクション選択あり）"));
    console.log(COLORS.muted("─".repeat(50)));
    console.log();
  }

  let running = true;

  while (running) {
    let input: string;
    try {
      const promptText = codec
        ? COLORS.accent(`${getCurrentTheme().layout?.userPanel?.name ?? "SNAKE"} > `)
        : COLORS.accent("you > ");
      input = await promptLine(promptText);
    } catch {
      // stdinが閉じた場合は終了
      break;
    }
    const trimmed = input.trim();

    if (!trimmed) continue;

    // 特殊コマンドの処理
    if (trimmed.startsWith("/")) {
      const handled = await handleSpecialCommand(trimmed, session);
      if (handled === "exit") {
        running = false;
        continue;
      }
      if (handled) continue;
    }

    if (codec) {
      // ── CODEC 描画 ──
      await showCodecUserMessage(trimmed);

      const spinner = createSpinner("受信中...").start();
      try {
        const response = await session.sendMessage(trimmed);
        spinner.stop();
        console.log();
        await showCodecAiResponse(response);
        console.log();
      } catch (error) {
        spinner.fail("通信エラー");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        console.log();
      }
    } else {
      // ── 従来描画 ──
      const spinner = createSpinner("考え中...").start();
      try {
        const response = await session.sendMessage(trimmed);
        spinner.stop();
        console.log();
        console.log(COLORS.success("ai > ") + response);
        console.log();
      } catch (error) {
        spinner.fail("応答の取得に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        console.log();
      }
    }
  }

  if (codec) {
    await showCodecClosing();
  } else {
    console.log(COLORS.muted("対話モードを終了しました。"));
  }
}

// ── コマンド定義 ──────────────────────────────────────────

export function createInteractiveCommand(): Command {
  const talk = new Command("talk")
    .description("対話モードでAIと会話する")
    .action(async () => {
      const projectPath = process.cwd();

      // デフォルトの Medium（Claude Code）を使用
      const medium = new ClaudeCodeAdapter();

      // Medium の利用可能性を確認
      const availability = await medium.checkAvailability();
      if (!availability.available) {
        printError(
          `Medium '${medium.name}' が利用できません: ${availability.reason ?? "不明なエラー"}`,
        );
        process.exitCode = 1;
        return;
      }

      const session = new InteractiveSessionUseCase(medium, projectPath);

      // ポリシーを読み込む
      await session.loadPolicy();

      await startInteractiveLoop(session);
    });

  return talk;
}
