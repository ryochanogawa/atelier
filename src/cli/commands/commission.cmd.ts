/**
 * Commission Commands
 * atelier commission run/list/validate
 */

import { Command } from "commander";
import ora from "ora";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import { CommissionValidateUseCase } from "../../application/use-cases/validate-commission.use-case.js";
import { CreatePRUseCase } from "../../application/use-cases/create-pr.use-case.js";
import { GitHubPRAdapter } from "../../adapters/vcs/github-pr.adapter.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, listFiles } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { COMMISSIONS_DIR, STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import {
  printRunResult,
  printTable,
  printSuccess,
  printError,
  printWarning,
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
      // 簡易実装: worktree 作成をスキップ
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
    .option("--base <branch>", "PR のベースブランチ", "main")
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();
      const spinner = ora(`Commission '${name}' を実行中...`).start();

      try {
        const mediumRegistry = await createMediumRegistry(projectPath);
        const eventBus = createEventBus();
        const useCase = new CommissionRunUseCase(
          createConfigPort(),
          createVcsPort(),
          createLoggerPort(),
          mediumRegistry,
          eventBus,
        );

        const result = await useCase.execute(name, projectPath, {
          dryRun: opts.dryRun,
          medium: opts.medium,
          tui: opts.tui,
        });

        spinner.stop();
        printRunResult(result);

        // --auto-pr: 実行成功時に自動で PR を作成
        if (opts.autoPr && result.status === "completed") {
          const prSpinner = ora("PR を作成中...").start();
          try {
            const prAdapter = new GitHubPRAdapter();
            const prUseCase = new CreatePRUseCase(prAdapter, createLoggerPort());
            const pr = await prUseCase.execute(result, {
              base: opts.base,
              head: `atelier/${result.runId}`,
            });
            prSpinner.stop();
            printSuccess(`PR #${pr.number} を作成しました`);
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
      const spinner = ora(`Commission '${name}' を検証中...`).start();

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
