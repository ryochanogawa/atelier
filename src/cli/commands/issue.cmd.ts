/**
 * Issue Commands
 * atelier issue run/add
 */

import { Command } from "commander";
import ora from "ora";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { RunIssueUseCase } from "../../application/use-cases/run-issue.use-case.js";
import { GitHubIssueAdapter } from "../../adapters/vcs/github.adapter.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, listFiles, writeTextFile } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { COMMISSIONS_DIR, STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import {
  printRunResult,
  printSuccess,
  printError,
  printInfo,
} from "../output.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
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
    async removeWorktree(_worktreePath: string): Promise<void> {
      // noop
    },
    async commitAll(_cwd: string, _message: string): Promise<void> {
      // noop
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
      return config ? { command: config.command, args: config.args } : undefined;
    },
    listMedia() {
      return Object.keys(mediaConfig);
    },
  };
}

export function createIssueCommand(): Command {
  const issue = new Command("issue")
    .description("GitHub Issue 連携");

  // issue run <number>
  issue
    .command("run <number>")
    .description("Issue 番号で Commission を実行する")
    .option("--commission <name>", "実行する Commission 名")
    .action(async (issueNumber: string, opts) => {
      const projectPath = process.cwd();
      const spinner = ora(`Issue #${issueNumber} を処理中...`).start();

      try {
        const issueAdapter = new GitHubIssueAdapter();
        const { owner, repo } = await issueAdapter.getCurrentRepo();

        const commissionName = opts.commission ?? "default";

        const mediumRegistry = await createMediumRegistry(projectPath);
        const eventBus = createEventBus();
        const useCase = new RunIssueUseCase(
          issueAdapter,
          createConfigPort(),
          createVcsPort(),
          createLoggerPort(),
          mediumRegistry,
          eventBus,
        );

        const result = await useCase.execute(
          owner,
          repo,
          parseInt(issueNumber, 10),
          commissionName,
          projectPath,
        );

        spinner.stop();
        printRunResult(result);
      } catch (error) {
        spinner.fail("Issue の処理に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // issue add <number>
  issue
    .command("add <number>")
    .description("Issue をタスクキューに追加する")
    .action(async (issueNumber: string) => {
      const projectPath = process.cwd();
      const spinner = ora(`Issue #${issueNumber} をキューに追加中...`).start();

      try {
        const issueAdapter = new GitHubIssueAdapter();
        const { owner, repo } = await issueAdapter.getCurrentRepo();
        const issueData = await issueAdapter.getIssue(
          owner,
          repo,
          parseInt(issueNumber, 10),
        );

        // タスクキューにファイルとして保存
        const queueDir = path.join(resolveAtelierPath(projectPath), "queue");
        const queueFile = path.join(queueDir, `issue-${issueNumber}.json`);
        await writeTextFile(
          queueFile,
          JSON.stringify(
            {
              type: "issue",
              number: issueData.number,
              title: issueData.title,
              body: issueData.body,
              labels: issueData.labels,
              url: issueData.url,
              addedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );

        spinner.stop();
        printSuccess(`Issue #${issueNumber} をキューに追加しました: ${issueData.title}`);
        printInfo(`保存先: ${queueFile}`);
      } catch (error) {
        spinner.fail("Issue の追加に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return issue;
}
