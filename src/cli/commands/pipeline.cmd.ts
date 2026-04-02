/**
 * Pipeline Commands
 * atelier pipeline run
 */

import { Command } from "commander";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { PipelineRunUseCase } from "../../application/use-cases/pipeline-run.use-case.js";
import { createPRAdapter } from "../../adapters/vcs/create-pr-adapter.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE, DEFAULT_MEDIA } from "../../shared/constants.js";
import {
  printRunResult,
  printSuccess,
  printError,
  printInfo,
  createSpinner,
} from "../output.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig, PipelineConfig } from "../../shared/types.js";

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
 * studio.yaml から pipeline セクションを読み込む。
 */
async function loadPipelineConfig(projectPath: string): Promise<PipelineConfig | undefined> {
  try {
    const configPath = path.join(
      resolveAtelierPath(projectPath),
      STUDIO_CONFIG_FILE,
    );
    const content = await readTextFile(configPath);
    const parsed = parseYaml(content) as Record<string, unknown>;
    const pipeline = parsed.pipeline as Record<string, unknown> | undefined;
    if (!pipeline) return undefined;
    return {
      branchPrefix: pipeline.branch_prefix as string | undefined,
      commitMessageTemplate: pipeline.commit_message_template as string | undefined,
      prTitleTemplate: pipeline.pr_title_template as string | undefined,
      prBodyTemplate: pipeline.pr_body_template as string | undefined,
      slackWebhookUrl: pipeline.slack_webhook_url as string | undefined,
    };
  } catch {
    return undefined;
  }
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
 * CI 環境かどうかを検出する。
 */
function isCI(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

export function createPipelineCommand(): Command {
  const pipeline = new Command("pipeline")
    .description("CI/CD パイプラインモード");

  // pipeline run <name>
  pipeline
    .command("run <name>")
    .description("CI/CD モードで Commission を実行する")
    .option("--auto-pr", "実行完了後に自動で PR を作成する", false)
    .option("--base <branch>", "PR のベースブランチ", "main")
    .option("--head <branch>", "PR のヘッドブランチ")
    .option("--medium <name>", "使用する Medium を指定")
    .option("--task <description>", "タスクの説明")
    .option("--json", "JSON 形式で出力", false)
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();
      const ciMode = isCI();

      // CI モードではスピナーを使わない
      const spinner = ciMode ? null : createSpinner(`Pipeline '${name}' を実行中...`).start();

      try {
        const mediumRegistry = await createMediumRegistry(projectPath);
        const eventBus = createEventBus();
        const prAdapter = opts.autoPr ? await createPRAdapter(projectPath) : undefined;
        const pipelineConfig = await loadPipelineConfig(projectPath);

        const useCase = new PipelineRunUseCase(
          createConfigPort(),
          createVcsPort(),
          createLoggerPort(),
          mediumRegistry,
          eventBus,
          prAdapter,
        );

        const result = await useCase.execute(name, projectPath, {
          autoPR: opts.autoPr,
          base: opts.base,
          head: opts.head,
          medium: opts.medium,
          task: opts.task,
          pipelineConfig,
        });

        spinner?.stop();

        // JSON 出力モード
        if (opts.json || ciMode) {
          console.log(JSON.stringify({
            run: result.runResult,
            pr: result.pr ?? null,
          }, null, 2));
        } else {
          printRunResult(result.runResult);

          if (result.pr) {
            printSuccess(`PR #${result.pr.number} を作成しました`);
            printInfo(`URL: ${result.pr.url}`);
          }
        }

        // CI/CD フレンドリーな終了コード
        if (result.runResult.status === "failed") {
          process.exitCode = 1;
        }
      } catch (error) {
        spinner?.fail("Pipeline の実行に失敗しました");

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (opts.json || ciMode) {
          console.error(JSON.stringify({ error: errorMessage }, null, 2));
        } else {
          printError(errorMessage);
        }

        process.exitCode = 1;
      }
    });

  return pipeline;
}
