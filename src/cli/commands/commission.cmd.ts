/**
 * Commission Commands
 * atelier commission run/list/validate
 */

import { Command } from "commander";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { simpleGit } from "simple-git";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import { CommissionValidateUseCase } from "../../application/use-cases/validate-commission.use-case.js";
import { CreatePRUseCase } from "../../application/use-cases/create-pr.use-case.js";
import { createPRAdapter } from "../../adapters/vcs/create-pr-adapter.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, listFiles, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { COMMISSIONS_DIR, STUDIO_CONFIG_FILE, DEFAULT_MEDIA } from "../../shared/constants.js";
import {
  printRunResult,
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printSectionDivider,
  createSpinner,
} from "../output.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import { createMediumExecutor } from "../factories/medium.factory.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";

/**
 * 簡易 ConfigPort 実装
 */
function createConfigPort(): ConfigPort {
  return {
    async loadStudioConfig(projectPath: string): Promise<StudioConfig> {
      const configPath = path.join(
        resolveAtelierPath(projectPath),
        STUDIO_CONFIG_FILE,
      );
      if (!(await fileExists(configPath))) {
        return { defaultMedium: "claude-code", language: "ja", logLevel: "info" };
      }
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const studio = parsed.studio as Record<string, unknown>;
      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
      };
    },
    async loadMediaConfig(
      projectPath: string,
    ): Promise<Record<string, MediumConfig>> {
      const configPath = path.join(
        resolveAtelierPath(projectPath),
        STUDIO_CONFIG_FILE,
      );
      if (!(await fileExists(configPath))) {
        return DEFAULT_MEDIA;
      }
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const media = (parsed.media ?? {}) as Record<string, Record<string, unknown>>;
      const result: Record<string, MediumConfig> = {};
      for (const [name, config] of Object.entries(media)) {
        result[name] = {
          command: (config.command as string) ?? name,
          args: ((config.args as string[]) ?? []),
        };
      }
      return result;
    },
  };
}

/**
 * Git worktree ベースの VcsPort 実装。
 * git リポジトリでない場合はフォールバックして basePath をそのまま返す。
 */
function createVcsPort(): VcsPort {
  return {
    async createWorktree(basePath: string, branchName: string): Promise<string> {
      const git = simpleGit(basePath);

      // git リポジトリかチェック
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        return basePath;
      }

      // 現在のブランチを記憶
      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

      // ブランチが既に存在するかチェック
      const branches = await git.branchLocal();
      if (!branches.all.includes(branchName)) {
        // ブランチを作成して元に戻す
        await git.checkoutLocalBranch(branchName);
        await git.checkout(currentBranch);
      }

      // worktree パスを決定
      const safeName = branchName.replace(/\//g, "-");
      const worktreePath = path.join(basePath, ".atelier", "worktrees", safeName);

      // 既に worktree が存在する場合はそのまま返す
      try {
        const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
        if (worktreeList.includes(worktreePath)) {
          return worktreePath;
        }
      } catch {
        // 無視
      }

      await git.raw(["worktree", "add", worktreePath, branchName]);
      return worktreePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {
      // takt と同様に削除しない — worktree を保持する。
      // ユーザーが atelier branch delete で明示的に削除する。
    },
    async commitAll(cwd: string, message: string): Promise<void> {
      const git = simpleGit(cwd);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) return;

      const status = await git.status();
      if (status.files.length === 0) return;

      await git.add("-A");
      await git.commit(message);
    },
  };
}

/**
 * 簡易 LoggerPort 実装
 */
function createLoggerPort(): LoggerPort {
  return {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    debug: (msg: string) => {
      if (process.env.DEBUG) console.debug(`[DEBUG] ${msg}`);
    },
  };
}

/**
 * No-op VcsPort 実装。--skip-git 時に使用。
 * worktree 作成・コミット・プッシュを一切行わず basePath をそのまま返す。
 */
function createNoopVcsPort(): VcsPort {
  return {
    async createWorktree(basePath: string, _branchName: string): Promise<string> {
      return basePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {},
    async commitAll(_cwd: string, _message: string): Promise<void> {},
  };
}

/** --context key=file を蓄積するコレクタ */
function collectContext(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const [key, ...rest] = value.split("=");
  const filePath = rest.join("=");
  if (key && filePath) {
    previous[key] = filePath;
  }
  return previous;
}

export function createCommissionCommand(): Command {
  const commission = new Command("commission")
    .description("Commission（ワークフロー）の管理・実行");

  // commission run <name>
  commission
    .command("run <name>")
    .description("Commission を実行する")
    .option("--dry-run", "ドライラン（実際には実行しない）", false)
    .option("--medium <name>", "使用する Medium を指定")
    .option("--tui", "TUI モードで実行", false)
    .option("--json", "JSON 形式で出力", false)
    .option("--auto-pr", "実行完了後に自動で PR を作成する", false)
    .option("--draft", "PR をドラフトとして作成する（--auto-pr と併用）", false)
    .option("--base <branch>", "PR のベースブランチ", "main")
    .option("--context <key=file...>", "Canvas に事前注入するファイル (例: requirements=./req.md)", collectContext, {})
    .option("--skip-git", "ブランチ作成・コミット・プッシュをスキップし、プロジェクト直下で直接実行する", false)
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`Commission '${name}' を実行中...`).start();

      try {
        const mediumExecutor = createMediumExecutor();
        const eventBus = createEventBus();
        const vcsPort = opts.skipGit ? createNoopVcsPort() : createVcsPort();
        const useCase = new CommissionRunUseCase(
          createConfigPort(),
          vcsPort,
          createLoggerPort(),
          mediumExecutor,
          eventBus,
        );

        // --context オプションからファイルを読み込んで initialCanvas を構築
        const initialCanvas: Record<string, string> = {};
        const contextEntries = opts.context as Record<string, string>;
        for (const [key, filePath] of Object.entries(contextEntries)) {
          const resolvedPath = path.resolve(projectPath, filePath);
          initialCanvas[key] = await readTextFile(resolvedPath);
        }

        const result = await useCase.execute(name, projectPath, {
          dryRun: opts.dryRun,
          medium: opts.medium,
          tui: opts.tui,
          initialCanvas: Object.keys(initialCanvas).length > 0 ? initialCanvas : undefined,
        });

        spinner.stop();
        printRunResult(result);

        // worktree 情報を表示
        const branchName = `atelier/${result.runId}`;
        const safeName = branchName.replace(/\//g, "-");
        const worktreePath = path.join(projectPath, ".atelier", "worktrees", safeName);

        // worktree が実際に作成されたか確認
        let worktreeCreated = false;
        try {
          const git = simpleGit(projectPath);
          const isRepo = await git.checkIsRepo().catch(() => false);
          if (isRepo) {
            const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
            worktreeCreated = worktreeList.includes(worktreePath);
          }
        } catch {
          // 無視
        }

        if (worktreeCreated) {
          console.log();
          printInfo(`ブランチ: ${branchName}`);
          printInfo(`Worktree: .atelier/worktrees/${safeName}`);
          console.log();
          printInfo("次のステップ:");
          console.log(`    atelier branch merge ${branchName}   # メインにマージ`);
          console.log(`    atelier branch delete ${branchName}  # 削除`);
          console.log(`    atelier branch retry ${branchName}   # 再実行`);
          console.log();
        } else {
          // worktree なし — 変更されたファイル一覧を表示
          try {
            const { execa } = await import("execa");
            const gitResult = await execa("git", ["status", "--short"], { cwd: projectPath, reject: false });
            if (gitResult.stdout.trim()) {
              printInfo("変更されたファイル:");
              console.log(gitResult.stdout);
              console.log();
            }
          } catch {
            // git が使えない場合は無視
          }
        }

        // --auto-pr: 実行成功時に自動で PR を作成
        if (opts.autoPr && result.status === "completed") {
          const prSpinner = createSpinner("PR を作成中...").start();
          try {
            const prAdapter = await createPRAdapter(projectPath);
            const prUseCase = new CreatePRUseCase(prAdapter, createLoggerPort());
            const pr = await prUseCase.execute(result, {
              base: opts.base,
              head: `atelier/${result.runId}`,
              draft: opts.draft,
            });
            prSpinner.stop();
            if (pr.skipped) {
              printInfo(`既存の PR #${pr.number} があるためスキップしました`);
            } else {
              printSuccess(`PR #${pr.number} を作成しました`);
            }
            printInfo(`URL: ${pr.url}`);
          } catch (prError) {
            prSpinner.fail("PR の作成に失敗しました");
            printError(
              prError instanceof Error ? prError.message : String(prError),
            );
          }
        }
      } catch (error) {
        spinner.fail("Commission の実行に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // commission list
  commission
    .command("list")
    .description("利用可能な Commission を一覧表示")
    .action(async () => {
      const projectPath = process.cwd();
      const commissionsDir = path.join(
        resolveAtelierPath(projectPath),
        COMMISSIONS_DIR,
      );

      try {
        const files = await listFiles(commissionsDir, ".yaml");

        if (files.length === 0) {
          printWarning("Commission が見つかりません");
          return;
        }

        const rows: string[][] = [];
        for (const file of files) {
          const content = await readTextFile(file);
          const parsed = parseYaml(content) as Record<string, unknown>;
          const name = (parsed.name as string) ?? path.basename(file, ".yaml");
          const desc = (parsed.description as string) ?? "-";
          const strokes = Array.isArray(parsed.strokes)
            ? parsed.strokes.length
            : 0;
          rows.push([name, desc, String(strokes)]);
        }

        printTable(["Name", "Description", "Strokes"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // commission validate <name>
  commission
    .command("validate <name>")
    .description("Commission YAML の構文・スキーマを検証")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`Commission '${name}' を検証中...`).start();

      try {
        const useCase = new CommissionValidateUseCase();
        const result = await useCase.execute(name, projectPath);

        spinner.stop();

        if (result.valid) {
          printSuccess(`Commission '${name}' は有効です`);
        } else {
          printError(`Commission '${name}' に問題があります`);
          for (const err of result.errors) {
            printError(`  ${err}`);
          }
        }

        for (const warn of result.warnings) {
          printWarning(`  ${warn}`);
        }
      } catch (error) {
        spinner.fail("検証に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return commission;
}
