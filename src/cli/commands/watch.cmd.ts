/**
 * Watch Command
 * atelier watch で常駐プロセスとして起動し、tasks.yaml を監視して自動実行する。
 * takt の TaskWatcher パターンを参考にポーリング方式で実装。
 */

import { Command } from "commander";
import { COLORS } from "../theme.js";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { TaskStoreAdapter } from "../../adapters/config/task-store.adapter.js";
import { TaskQueue, type Task } from "../../domain/models/task.model.js";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import { DirectRunUseCase } from "../../application/use-cases/direct-run.use-case.js";
import { simpleGit } from "simple-git";
import { generateRunId } from "../../shared/utils.js";
import {
  printSuccess,
  printError,
  printInfo,
  printWarning,
} from "../output.js";

const DEFAULT_POLL_INTERVAL = 2000;

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
      const concurrencyRaw = studio?.concurrency as number | undefined;
      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
        concurrency: concurrencyRaw != null ? Math.max(1, Math.min(10, concurrencyRaw)) : undefined,
        baseBranch: (studio?.base_branch as string) ?? undefined,
        minimalOutput: (studio?.minimal_output as boolean) ?? false,
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
 * VcsPort 実装
 */
function createVcsPort(): VcsPort {
  return {
    async createWorktree(basePath: string, branchName: string): Promise<string> {
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
        if (worktreeList.includes(worktreePath)) {
          return worktreePath;
        }
      } catch {
        // ignore
      }

      await git.raw(["worktree", "add", worktreePath, branchName]);
      return worktreePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {},
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
 * LoggerPort 実装
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
 * MediumRegistry を構築する。
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
 * 1つのタスクを実行する。
 */
async function executeOneTask(
  task: Task,
  projectPath: string,
  store: TaskStoreAdapter,
  queue: TaskQueue,
): Promise<boolean> {
  queue.markRunning(task.id);
  await store.save(queue.list());

  try {
    if (task.commission) {
      // Commission 経由実行
      const mediumRegistry = await createMediumRegistry(projectPath);
      const eventBus = createEventBus();
      const vcsPort = createVcsPort();
      const useCase = new CommissionRunUseCase(
        createConfigPort(),
        vcsPort,
        createLoggerPort(),
        mediumRegistry,
        eventBus,
      );

      const result = await useCase.execute(task.commission, projectPath, {
        dryRun: false,
        initialCanvas: { requirements: task.description },
      });

      if (result.status === "completed") {
        queue.markCompleted(task.id);
        await store.save(queue.list());
        return true;
      } else {
        queue.markFailed(task.id);
        await store.save(queue.list());
        return false;
      }
    } else {
      // Commission 未指定の場合は直接実行
      const runId = generateRunId();
      const branchName = `atelier/${runId}`;
      const vcsPort = createVcsPort();

      let worktreePath = projectPath;
      let worktreeCreated = false;
      try {
        worktreePath = await vcsPort.createWorktree(projectPath, branchName);
        worktreeCreated = worktreePath !== projectPath;
      } catch {
        worktreePath = projectPath;
      }

      const useCase = new DirectRunUseCase();
      const result = await useCase.execute(task.description, projectPath, {
        worktreePath: worktreeCreated ? worktreePath : undefined,
      });

      if (result.status === "completed") {
        if (worktreeCreated) {
          try {
            await vcsPort.commitAll(worktreePath, `atelier: watch task (${runId})`);
          } catch {
            // ignore
          }
        }
        queue.markCompleted(task.id);
        await store.save(queue.list());
        return true;
      } else {
        queue.markFailed(task.id);
        await store.save(queue.list());
        return false;
      }
    }
  } catch (error) {
    queue.markFailed(task.id);
    await store.save(queue.list());
    printError(`タスク実行エラー: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export function createWatchCommand(): Command {
  const watch = new Command("watch")
    .description("タスクキューを監視し、新しいタスクを自動実行する（常駐モード）")
    .option("--interval <ms>", "ポーリング間隔（ミリ秒）", String(DEFAULT_POLL_INTERVAL))
    .option("--concurrency <number>", "最大並列実行数（studio.yaml のデフォルトを上書き）")
    .action(async (opts) => {
      const projectPath = process.cwd();
      const pollInterval = parseInt(opts.interval, 10) || DEFAULT_POLL_INTERVAL;
      const store = new TaskStoreAdapter(projectPath);

      // studio.yaml から concurrency デフォルト値を取得
      let configConcurrency = 1;
      try {
        const configPort = createConfigPort();
        const studioConfig = await configPort.loadStudioConfig(projectPath);
        configConcurrency = studioConfig.concurrency ?? 1;
      } catch {
        // 設定ファイルがない場合はデフォルト1
      }
      const concurrency = opts.concurrency
        ? Math.max(1, parseInt(opts.concurrency, 10) || 1)
        : configConcurrency;

      let running = true;
      let taskCount = 0;
      let successCount = 0;
      let failCount = 0;

      // AbortController for interruptible sleep
      let abortController = new AbortController();

      console.log();
      console.log(COLORS.accent.bold("ATELIER Watch Mode"));
      console.log(COLORS.muted("─".repeat(50)));
      printInfo(`監視対象: .atelier/tasks.yaml`);
      printInfo(`ポーリング間隔: ${pollInterval}ms`);
      if (concurrency > 1) {
        printInfo(`並列実行数: ${concurrency}`);
      }
      printInfo("タスクを待機中... (Ctrl+C で停止)");
      console.log();

      // Graceful shutdown
      const shutdown = () => {
        if (!running) {
          // 2回目の Ctrl+C で強制終了
          process.exit(130);
        }
        console.log();
        printInfo("停止中...");
        running = false;
        abortController.abort();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      const sleep = (ms: number): Promise<void> => {
        return new Promise((resolve) => {
          const signal = abortController.signal;
          if (signal.aborted) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, ms);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      };

      try {
        while (running) {
          // タスクを読み込み
          const tasks = await store.load();
          const queue = new TaskQueue(tasks);
          const next = queue.getNext();

          if (next) {
            // 並列実行: concurrency 個のタスクを同時に実行
            const tasksToRun: Task[] = [next];
            if (concurrency > 1) {
              // 追加の pending タスクを取得
              for (let i = 1; i < concurrency; i++) {
                const additional = queue.getNext();
                if (additional && !tasksToRun.find(t => t.id === additional.id)) {
                  tasksToRun.push(additional);
                } else {
                  break;
                }
              }
            }

            const promises = tasksToRun.map(async (t) => {
              taskCount++;
              const currentCount = taskCount;
              console.log();
              printInfo(`=== タスク ${currentCount}: ${t.description} ===`);
              console.log();

              const success = await executeOneTask(t, projectPath, store, queue);

              if (success) {
                successCount++;
                printSuccess(`タスク完了: ${t.description}`);
              } else {
                failCount++;
                printError(`タスク失敗: ${t.description}`);
              }
            });

            await Promise.all(promises);

            console.log();
            printInfo("タスクを待機中... (Ctrl+C で停止)");
            // タスク完了後は即座に次のタスクをチェック
            continue;
          }

          // タスクがない場合はポーリング待機
          await sleep(pollInterval);
        }
      } finally {
        process.removeListener("SIGINT", shutdown);
        process.removeListener("SIGTERM", shutdown);
      }

      // サマリー表示
      if (taskCount > 0) {
        console.log();
        console.log(COLORS.accent.bold("Watch サマリー"));
        console.log(COLORS.muted("─".repeat(50)));
        printInfo(`合計: ${taskCount}`);
        printSuccess(`成功: ${successCount}`);
        if (failCount > 0) {
          printError(`失敗: ${failCount}`);
        }
      }

      console.log();
      printSuccess("Watch を停止しました。");
    });

  return watch;
}
