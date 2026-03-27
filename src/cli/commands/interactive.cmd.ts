/**
 * Interactive Commands
 * atelier talk - 対話モードでAIと会話し、タスクをキューに追加する。
 */

import { Command } from "commander";
import readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import { InteractiveSessionUseCase } from "../../application/use-cases/interactive-session.use-case.js";
import { ClaudeCodeAdapter } from "../../adapters/medium/claude-code.adapter.js";
import { RequirementsAnalyzerService } from "../../domain/services/requirements-analyzer.service.js";
import { IntentEnhancerService } from "../../domain/services/intent-enhancer.service.js";
import { printSuccess, printError, printWarning, printInfo, printTable } from "../output.js";

/**
 * 対話ループを開始する。
 */
async function startInteractiveLoop(
  session: InteractiveSessionUseCase,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log();
  console.log(chalk.bold("ATELIER Interactive Mode"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(chalk.dim("対話モードを開始しました。AIに質問や指示を入力してください。"));
  console.log(chalk.dim("特殊コマンド:"));
  console.log(chalk.dim("  /queue <description> - タスクをキューに追加"));
  console.log(chalk.dim("  /run               - キュー内の全タスクを実行"));
  console.log(chalk.dim("  /list              - キュー内タスク一覧"));
  console.log(chalk.dim("  /requirements      - 構造化要件定義モード"));
  console.log(chalk.dim("  /analyze           - 会話から要件を自動抽出"));
  console.log(chalk.dim("  /suggest           - Commission/Palette提案"));
  console.log(chalk.dim("  /exit              - 終了"));
  console.log(chalk.dim("─".repeat(50)));
  console.log();

  const prompt = (): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.cyan("you > "), (answer) => {
        resolve(answer);
      });
    });
  };

  let running = true;

  while (running) {
    const input = await prompt();
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

    // 通常のメッセージをAIに送信
    const spinner = ora({ text: "考え中...", color: "cyan" }).start();
    try {
      const response = await session.sendMessage(trimmed);
      spinner.stop();
      console.log();
      console.log(chalk.green("ai > ") + response);
      console.log();
    } catch (error) {
      spinner.fail("応答の取得に失敗しました");
      printError(
        error instanceof Error ? error.message : String(error),
      );
      console.log();
    }
  }

  rl.close();
  console.log(chalk.dim("対話モードを終了しました。"));
}

/**
 * 特殊コマンドを処理する。
 * @returns "exit" で終了、true で処理済み、false で未処理。
 */
async function handleSpecialCommand(
  input: string,
  session: InteractiveSessionUseCase,
): Promise<string | boolean> {
  const parts = input.split(/\s+/);
  const command = parts[0];

  switch (command) {
    case "/exit": {
      return "exit";
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
      handleAnalyzeConversation(session);
      return true;
    }

    case "/suggest": {
      handleSuggest(session);
      return true;
    }

    default: {
      printWarning(`不明なコマンド: ${command}`);
      return true;
    }
  }
}

/**
 * 構造化要件定義モード。
 * AIがインタビュー形式で要件をヒアリングし、構造化する。
 */
async function handleRequirementsMode(
  session: InteractiveSessionUseCase,
): Promise<void> {
  console.log();
  console.log(chalk.bold.blue("--- 構造化要件定義モード ---"));
  console.log(chalk.dim("AIが質問形式で要件をヒアリングします。"));
  console.log(chalk.dim("回答を入力してください。「/done」で要件を確定します。"));
  console.log();

  const interviewPrompt = [
    "あなたは要件ヒアリングの専門家です。",
    "ユーザーに対して段階的に質問を行い、要件を引き出してください。",
    "まず最初に、プロジェクトの目的とゴールについて2-3個の質問をしてください。",
    "質問は日本語で、分かりやすく簡潔に行ってください。",
  ].join("\n");

  const spinner = ora({ text: "質問を準備中...", color: "cyan" }).start();
  try {
    const response = await session.sendMessage(interviewPrompt);
    spinner.stop();
    console.log(chalk.green("ai > ") + response);
    console.log();
    printInfo("回答を入力してください。要件定義が完了したら /done と入力してください。");
    console.log();
  } catch (error) {
    spinner.fail("質問の準備に失敗しました");
    printError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 現在の会話から要件を自動抽出・構造化する。
 */
function handleAnalyzeConversation(
  session: InteractiveSessionUseCase,
): void {
  const history = session.getHistory();

  if (history.length === 0) {
    printWarning("会話履歴がありません。先にAIと会話してください。");
    console.log();
    return;
  }

  // 会話履歴からユーザー発言を結合して要件テキストとする
  const userMessages = history
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");

  const analyzer = new RequirementsAnalyzerService();
  const doc = analyzer.analyzeRequirements(userMessages);

  console.log();
  console.log(chalk.bold.blue(`--- 要件分析結果: ${doc.title} ---`));
  console.log();

  // 機能要件
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

  // 非機能要件
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

  // 矛盾検出
  const allReqs = [...doc.functional, ...doc.nonFunctional];
  const contradictions = analyzer.detectContradictions(allReqs);
  if (contradictions.length > 0) {
    printWarning(`矛盾検出 (${contradictions.length}件):`);
    for (const c of contradictions) {
      const icon = c.severity === "error" ? chalk.red("[ERROR]") : chalk.yellow("[WARN]");
      console.log(`  ${icon} ${c.requirementIds.join(" <-> ")}: ${c.reason}`);
    }
    console.log();
  }

  // ギャップ検出
  const gaps = analyzer.detectGaps(allReqs);
  if (gaps.length > 0) {
    printWarning(`抜け漏れ検出 (${gaps.length}件):`);
    for (const g of gaps) {
      console.log(`  ${chalk.yellow("-")} [${g.category}] ${g.description}`);
      console.log(`    ${chalk.dim("提案: " + g.suggestion)}`);
    }
    console.log();
  }

  // チェックリスト
  const checklist = analyzer.generateChecklist(allReqs);
  printInfo(`確認チェックリスト (${checklist.items.length}件):`);
  for (const item of checklist.items) {
    const mark = item.required ? chalk.red("*") : chalk.dim("o");
    console.log(`  ${mark} [${item.category}] ${item.question}`);
  }
  console.log();

  // 前提条件
  if (doc.assumptions.length > 0) {
    printInfo("前提条件:");
    for (const a of doc.assumptions) {
      console.log(`  - ${a}`);
    }
    console.log();
  }

  // オープンクエスチョン
  if (doc.openQuestions.length > 0) {
    printInfo("未確定事項:");
    for (const q of doc.openQuestions) {
      console.log(`  ? ${q}`);
    }
    console.log();
  }
}

/**
 * 最適なCommission/Paletteを提案する。
 */
function handleSuggest(
  session: InteractiveSessionUseCase,
): void {
  const history = session.getHistory();
  const enhancer = new IntentEnhancerService();

  // 会話の直近の内容をタスク記述として使用
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
  console.log(chalk.bold.blue("--- 推奨提案 ---"));
  console.log();

  // Palette提案
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

  // Commission提案
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

  // プロンプト強化提案
  const enhanced = enhancer.enhance(taskDescription);
  if (enhanced.addedContexts.length > 0) {
    printInfo(`プロンプト強化提案 (${enhanced.addedContexts.length}件):`);
    for (const ctx of enhanced.addedContexts) {
      console.log(
        `  ${chalk.yellow("+")} [${chalk.bold(ctx.category)}] ${ctx.content}`,
      );
    }
    console.log();
  }
}

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

      await startInteractiveLoop(session);
    });

  return talk;
}
