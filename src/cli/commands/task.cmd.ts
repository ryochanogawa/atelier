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
 * 簡易 VcsPort 実装
 */
function createVcsPort(): VcsPort {
  return {
    async createWorktree(_basePath: string, _branchName: string): Promise<string> {
      return _basePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {},
    async commitAll(_cwd: string, _message: string): Promise<void> {},
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
    .action(async (description: string, opts) => {
      const projectPath = process.cwd();

      try {
        const useCase = new QueueTaskUseCase(projectPath);
        const newTask = await useCase.execute({
          description,
          commission: opts.commission,
          source: "manual",
        });

        printSuccess(`タスクを追加しました: ${newTask.id}`);
        printInfo(`  説明: ${newTask.description}`);
        if (newTask.commission) {
          printInfo(`  Commission: ${newTask.commission}`);
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

          return [t.id, t.description, statusColor, t.commission ?? "-", t.source];
        });

        printTable(["ID", "Description", "Status", "Commission", "Source"], rows);
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
