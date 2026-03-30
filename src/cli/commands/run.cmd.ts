/**
 * Run Command
 * atelier run "タスク説明" でタスクを直接実行する。
 * Commission 経由または --direct で直接実行をサポート。
 */

import { Command } from "commander";
import ora from "ora";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { simpleGit } from "simple-git";
import { DirectRunUseCase } from "../../application/use-cases/direct-run.use-case.js";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import { CreatePRUseCase } from "../../application/use-cases/create-pr.use-case.js";
import { createPRAdapter } from "../../adapters/vcs/create-pr-adapter.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig, PaletteProviderConfig } from "../../shared/types.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath, generateRunId } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import {
  printSuccess,
  printError,
  printInfo,
  printWarning,
} from "../output.js";

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
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const studio = parsed.studio as Record<string, unknown>;
      // palette_providers の読み込み
      const rawPaletteProviders = (parsed.palette_providers ?? {}) as Record<string, Record<string, unknown>>;
      const paletteProviders: Record<string, PaletteProviderConfig> = {};
      for (const [name, config] of Object.entries(rawPaletteProviders)) {
        paletteProviders[name] = {
          medium: config.medium as string | undefined,
          model: config.model as string | undefined,
        };
      }

      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
        ...(Object.keys(paletteProviders).length > 0 ? { paletteProviders } : {}),
      };
    },
    async loadMediaConfig(
      projectPath: string,
    ): Promise<Record<string, MediumConfig>> {
      const configPath = path.join(
        resolveAtelierPath(projectPath),
        STUDIO_CONFIG_FILE,
      );
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
 * worktree 作成・コミット・プッシュを一切行わず projectPath をそのまま返す。
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

/**
 * MediumRegistry を studio.yaml から構築する。
 */
async function createMediumRegistry(projectPath: string): Promise<MediumRegistry> {
  const configPort = createConfigPort();
  const mediaConfig = await configPort.loadMediaConfig(projectPath);

  return {
    getCommand(mediumName: string) {
      const config = mediaConfig[mediumName];
      return config ? { command: config.command, args: config.args } : undefined;
    },
    listMedia() {
      return Object.keys(mediaConfig);
    },
  };
}

/**
 * タスク実行のコアロジック。
 * run サブコマンドとデフォルト引数の両方から呼ばれる。
 */
export async function executeTask(
  task: string,
  opts: {
    commission?: string;
    medium?: string;
    direct?: boolean;
    dryRun?: boolean;
    palette?: string;
    skipGit?: boolean;
    autoPr?: boolean;
    draft?: boolean;
    base?: string;
  },
): Promise<void> {
  const projectPath = process.cwd();

  if (opts.direct) {
    // --direct モード: Commission を経由せず直接実行
    const spinner = ora("タスクを実行中...").start();

    try {
      // worktree を作成してその中で実行
      const runId = generateRunId();
      const branchName = `atelier/${runId}`;
      const vcsPort = createVcsPort();
      let worktreePath = projectPath;
      let worktreeCreated = false;

      if (!opts.dryRun && !opts.skipGit) {
        try {
          worktreePath = await vcsPort.createWorktree(projectPath, branchName);
          worktreeCreated = worktreePath !== projectPath;
        } catch {
          worktreePath = projectPath;
        }
      }

      const useCase = new DirectRunUseCase();
      const result = await useCase.execute(task, projectPath, {
        medium: opts.medium,
        dryRun: opts.dryRun,
        palette: opts.palette,
        worktreePath: worktreeCreated ? worktreePath : undefined,
      });

      // 実行完了後にコミット
      if (!opts.dryRun && worktreeCreated && result.status === "completed") {
        try {
          await vcsPort.commitAll(worktreePath, `atelier: direct run (${runId})`);
        } catch {
          // コミット失敗は無視
        }
      }

      spinner.stop();

      if (opts.dryRun) {
        printInfo("ドライラン: 以下のプロンプトが送信されます");
        console.log();
        console.log(result.prompt);
        console.log();
        return;
      }

      if (result.status === "completed") {
        printSuccess(`タスクが完了しました (${Math.round(result.duration / 1000)}s)`);
      } else {
        printError(`タスクが失敗しました (exitCode=${result.exitCode})`);
        if (result.stderr) {
          console.error(result.stderr.slice(0, 500));
        }
      }

      // stdout を表示
      if (result.stdout) {
        console.log();
        console.log(result.stdout);
      }

      // worktree 情報 or git status を表示
      if (worktreeCreated) {
        const safeName = branchName.replace(/\//g, "-");
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
        await showGitStatus(projectPath);
      }

      // --auto-pr: 実行成功時に自動で PR を作成（direct モード、dry-run時はスキップ）
      if (opts.autoPr && !opts.dryRun && result.status === "completed" && worktreeCreated) {
        const prSpinner = ora("PR を作成中...").start();
        try {
          const prAdapter = await createPRAdapter(projectPath);
          const prUseCase = new CreatePRUseCase(prAdapter, createLoggerPort());
          // direct モードでは RunResultDto がないので簡易的に構築
          const dummyResult = {
            runId,
            commissionName: "direct",
            status: "completed" as const,
            strokesExecuted: 1,
            strokesTotal: 1,
            duration: result.duration,
            startedAt: "",
            completedAt: "",
            errors: [] as readonly { strokeName: string; message: string; timestamp: string }[],
          };
          const pr = await prUseCase.execute(dummyResult, {
            base: opts.base ?? "main",
            head: branchName,
            draft: opts.draft,
            taskDescription: task,
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
          printError(prError instanceof Error ? prError.message : String(prError));
        }
      }
    } catch (error) {
      spinner.fail("タスクの実行に失敗しました");
      printError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } else {
    // Commission 経由モード
    const commissionName = opts.commission ?? "default";
    const spinner = ora(`Commission '${commissionName}' でタスクを実行中...`).start();

    try {
      const mediumRegistry = await createMediumRegistry(projectPath);
      const eventBus = createEventBus();
      const vcsPort = opts.skipGit ? createNoopVcsPort() : createVcsPort();
      const useCase = new CommissionRunUseCase(
        createConfigPort(),
        vcsPort,
        createLoggerPort(),
        mediumRegistry,
        eventBus,
      );

      const result = await useCase.execute(commissionName, projectPath, {
        dryRun: opts.dryRun ?? false,
        medium: opts.medium,
        initialCanvas: { requirements: task },
      });

      spinner.stop();

      if (result.status === "completed") {
        printSuccess(
          `タスクが完了しました (${result.strokesExecuted} strokes, ${Math.round(result.duration / 1000)}s)`,
        );
      } else {
        printError(`タスクが失敗しました (status=${result.status})`);
        for (const err of result.errors) {
          printError(`  [${err.strokeName}] ${err.message}`);
        }
      }

      // worktree 情報を表示
      const branchName = `atelier/${result.runId}`;
      const safeName = branchName.replace(/\//g, "-");
      const worktreePath = path.join(projectPath, ".atelier", "worktrees", safeName);

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
        await showGitStatus(projectPath);
      }

      // --auto-pr: 実行成功時に自動で PR を作成（Commission モード、dry-run時はスキップ）
      if (opts.autoPr && !opts.dryRun && result.status === "completed") {
        const prSpinner = ora("PR を作成中...").start();
        try {
          const prAdapter = await createPRAdapter(projectPath);
          const prUseCase = new CreatePRUseCase(prAdapter, createLoggerPort());
          const pr = await prUseCase.execute(result, {
            base: opts.base ?? "main",
            head: branchName,
            draft: opts.draft,
            taskDescription: task,
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
          printError(prError instanceof Error ? prError.message : String(prError));
        }
      }
    } catch (error) {
      spinner.fail("タスクの実行に失敗しました");
      printError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}

/**
 * git status で変更ファイル一覧を表示する。
 */
async function showGitStatus(projectPath: string): Promise<void> {
  try {
    const { execa } = await import("execa");
    const gitResult = await execa("git", ["status", "--short"], {
      cwd: projectPath,
      reject: false,
    });
    if (gitResult.stdout.trim()) {
      console.log();
      printInfo("変更されたファイル:");
      console.log(gitResult.stdout);
    }
  } catch {
    // git が使えない場合は無視
  }
}

export function createRunCommand(): Command {
  const run = new Command("run")
    .description("タスクを実行する")
    .argument("<task>", "タスクの説明")
    .option("--commission <name>", "使用する Commission を指定", "default")
    .option("--medium <name>", "使用する Medium を指定")
    .option("--direct", "Commission を使わず直接実行", false)
    .option("--dry-run", "ドライラン（実際には実行しない）", false)
    .option("--palette <name>", "使用する Palette を指定（--direct 時）", "coder")
    .option("--skip-git", "ブランチ作成・コミット・プッシュをスキップし、プロジェクト直下で直接実行する", false)
    .option("--auto-pr", "実行完了後に自動で PR を作成する", false)
    .option("--draft", "PR をドラフトとして作成する（--auto-pr と併用）", false)
    .option("--base <branch>", "PR のベースブランチ", "main")
    .action(async (task: string, opts) => {
      await executeTask(task, {
        commission: opts.commission,
        medium: opts.medium,
        direct: opts.direct,
        dryRun: opts.dryRun,
        palette: opts.palette,
        skipGit: opts.skipGit,
        autoPr: opts.autoPr,
        draft: opts.draft,
        base: opts.base,
      });
    });

  return run;
}
