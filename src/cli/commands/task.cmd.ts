/**
 * Task Commands
 * atelier task add/list/run/remove
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { QueueTaskUseCase, RunQueueUseCase, type TaskRunDetail } from "../../application/use-cases/queue-task.use-case.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from "../output.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { simpleGit } from "simple-git";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";

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
        if (worktreeList.includes(worktreePath)) return worktreePath;
      } catch { /* ignore */ }

      await git.raw(["worktree", "add", worktreePath, branchName]);
      return worktreePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {
      // worktree を保持する（ユーザーが branch merge/delete で管理）
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
 * MediumRegistry を studio.yaml から構築する。
 */
async function createMediumRegistry(projectPath: string): Promise<MediumRegistry> {
  const configPort = createConfigPort();
  const mediaConfig = await configPort.loadMediaConfig(projectPath);

  return {
    getCommand(mediumName: string) {
      const config = mediaConfig[mediumName];
      return config ? { command: config.command, args: [...config.args] } : undefined;
    },
    listMedia() {
      return Object.keys(mediaConfig);
    },
  };
}

export function createTaskCommand(): Command {
  const task = new Command("task")
    .description("タスクキューの管理・実行");

  // task add <description>
  task
    .command("add <description>")
    .description("タスクをキューに追加する")
    .option("--commission <name>", "使用する Commission を指定")
    .option("--req <number>", "紐づける要件定義ID")
    .action(async (description: string, opts) => {
      const projectPath = process.cwd();

      try {
        const requirementsId = opts.req ? parseInt(opts.req, 10) : undefined;
        if (opts.req && (isNaN(requirementsId!) || requirementsId! < 1)) {
          printError("--req には正の整数を指定してください");
          process.exitCode = 1;
          return;
        }

        const useCase = new QueueTaskUseCase(projectPath);
        const newTask = await useCase.execute({
          description,
          commission: opts.commission,
          requirementsId,
          source: "manual",
        });

        printSuccess(`タスクを追加しました: ${newTask.id}`);
        printInfo(`  説明: ${newTask.description}`);
        if (newTask.commission) {
          printInfo(`  Commission: ${newTask.commission}`);
        }
        if (newTask.requirementsId != null) {
          printInfo(`  要件定義: #${newTask.requirementsId}`);
        }
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // task list
  task
    .command("list")
    .description("キュー内のタスク一覧を表示")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const useCase = new QueueTaskUseCase(projectPath);
        const tasks = await useCase.list();

        if (tasks.length === 0) {
          printWarning("キューにタスクがありません");
          return;
        }

        const rows = tasks.map((t) => {
          const statusColor =
            t.status === "completed"
              ? chalk.green(t.status)
              : t.status === "failed"
                ? chalk.red(t.status)
                : t.status === "running"
                  ? chalk.yellow(t.status)
                  : chalk.white(t.status);

          return [t.id, t.description, statusColor, t.commission ?? "-", t.requirementsId != null ? `#${t.requirementsId}` : "-", t.source];
        });

        printTable(["ID", "Description", "Status", "Commission", "Req", "Source"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // task run
  task
    .command("run")
    .description("キュー内のタスクを一括実行する")
    .option("--concurrency <number>", "最大並列実行数", "1")
    .option("--auto-pr", "実行完了後に自動で PR を作成する", false)
    .option("--draft", "PR をドラフトとして作成する", false)
    .option("--base <branch>", "PR のベースブランチ", "main")
    .action(async (opts) => {
      const projectPath = process.cwd();
      const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 1);
      const spinner = ora(
        concurrency > 1
          ? `キュー内のタスクを並列実行中 (concurrency=${concurrency})...`
          : "キュー内のタスクを実行中...",
      ).start();

      try {
        const mediumRegistry = await createMediumRegistry(projectPath);
        const eventBus = createEventBus();

        const useCase = new RunQueueUseCase(
          projectPath,
          createConfigPort(),
          createVcsPort(),
          createLoggerPort(),
          mediumRegistry,
          eventBus,
        );

        const result = await useCase.execute(projectPath, concurrency);
        spinner.stop();

        // サマリー表示
        const total = result.completed + result.failed;
        if (result.failed > 0) {
          printSuccess(
            `タスク実行完了 (${result.completed}/${total} 成功, ${result.failed} 失敗)`,
          );
        } else {
          printSuccess(
            `タスク実行完了 (${result.completed}/${total} 成功)`,
          );
        }

        // 詳細テーブル表示
        if (result.details.length > 0) {
          const rows = result.details.map((d: TaskRunDetail) => [
            d.task.description,
            d.success ? chalk.green("成功") : chalk.red("失敗"),
            d.branch ?? "-",
            d.error ? d.error.substring(0, 60) : "",
          ]);

          printTable(
            ["タスク", "状態", "ブランチ", "エラー"],
            rows,
          );
        }

        // --auto-pr: 成功したタスクの PR を自動作成
        if (opts.autoPr && result.details.length > 0) {
          const { createPRAdapter } = await import("../../adapters/vcs/create-pr-adapter.js");
          const { CreatePRUseCase } = await import("../../application/use-cases/create-pr.use-case.js");

          const prAdapter = await createPRAdapter(projectPath);
          const prUseCase = new CreatePRUseCase(prAdapter, createLoggerPort());

          const successDetails = result.details.filter((d: TaskRunDetail) => d.success && d.branch);
          if (successDetails.length > 0) {
            printInfo(`\n${successDetails.length} 件の PR を作成中...`);
          }

          for (const detail of successDetails) {
            const prSpinner = ora(`PR 作成: ${detail.task.description.substring(0, 40)}...`).start();
            try {
              const pr = await prUseCase.execute(
                {
                  runId: detail.branch!.replace("atelier/", "run_"),
                  commissionName: detail.task.commission ?? "default",
                  status: "completed",
                  strokesExecuted: 1,
                  strokesTotal: 1,
                  duration: 0,
                  startedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  errors: [],
                },
                {
                  base: opts.base ?? "main",
                  head: detail.branch!,
                  draft: opts.draft,
                  taskDescription: detail.task.description,
                },
              );
              prSpinner.stop();
              if (pr.skipped) {
                printInfo(`  既存 PR あり: ${detail.branch}`);
              } else {
                printSuccess(`  PR #${pr.number} 作成: ${pr.url}`);
              }
            } catch (prError) {
              prSpinner.fail(`  PR 作成失敗: ${detail.branch}`);
              printError(
                `    ${prError instanceof Error ? prError.message : String(prError)}`,
              );
            }
          }
        }
      } catch (error) {
        spinner.fail("タスク実行に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // task remove <id>
  task
    .command("remove <id>")
    .description("タスクをキューから削除する")
    .action(async (id: string) => {
      const projectPath = process.cwd();

      try {
        const useCase = new QueueTaskUseCase(projectPath);
        const removed = await useCase.remove(id);

        if (removed) {
          printSuccess(`タスク '${id}' を削除しました`);
        } else {
          printWarning(`タスク '${id}' が見つかりません`);
        }
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return task;
}
