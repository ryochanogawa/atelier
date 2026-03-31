/**
 * Branch Commands
 * atelier branch list/merge/delete/retry/instruct
 * worktree 管理と連携して takt 同等のブランチ管理を提供する。
 */

import { Command } from "commander";
import { COLORS } from "../theme.js";
import readline from "node:readline";
import path from "node:path";
import { simpleGit } from "simple-git";
import { ManageBranchesUseCase } from "../../application/use-cases/manage-branches.use-case.js";
import { DirectRunUseCase } from "../../application/use-cases/direct-run.use-case.js";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, listFiles, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE, LOGS_DIR } from "../../shared/constants.js";
import { parse as parseYaml } from "yaml";
import type { RunResultDto } from "../../application/dto/run-result.dto.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  createSpinner,
} from "../output.js";

/**
 * 簡易 ConfigPort 実装（branch コマンド用）
 */
function createBranchConfigPort(): ConfigPort {
  return {
    async loadStudioConfig(projectPath: string): Promise<StudioConfig> {
      const configPath = path.join(
        resolveAtelierPath(projectPath),
        STUDIO_CONFIG_FILE,
      );
      try {
        const content = await readTextFile(configPath);
        const parsed = parseYaml(content) as Record<string, unknown>;
        const studio = parsed.studio as Record<string, unknown>;
        return {
          defaultMedium: (studio?.default_medium as string) ?? "claude-code",
          language: (studio?.language as string) ?? "ja",
          logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
        };
      } catch {
        return { defaultMedium: "claude-code", language: "ja", logLevel: "info" };
      }
    },
    async loadMediaConfig(
      projectPath: string,
    ): Promise<Record<string, MediumConfig>> {
      const configPath = path.join(
        resolveAtelierPath(projectPath),
        STUDIO_CONFIG_FILE,
      );
      try {
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
      } catch {
        return { "claude-code": { command: "claude", args: [] } };
      }
    },
  };
}

/**
 * No-op VcsPort 実装（worktree 内で直接実行するため）
 */
function createBranchNoopVcsPort(): VcsPort {
  return {
    async createWorktree(basePath: string, _branchName: string): Promise<string> {
      return basePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {},
    async commitAll(_cwd: string, _message: string): Promise<void> {},
  };
}

/**
 * LoggerPort 実装（branch コマンド用）
 */
function createBranchLoggerPort(): LoggerPort {
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
 * MediumRegistry を構築する（branch コマンド用）
 */
async function createBranchMediumRegistry(projectPath: string): Promise<MediumRegistry> {
  const configPort = createBranchConfigPort();
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

export function createBranchCommand(): Command {
  const branch = new Command("branch")
    .description("atelier/ ブランチ・worktree の管理");

  // branch list
  branch
    .command("list")
    .description("atelier/ プレフィックスのブランチ・worktree 一覧を表示")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        const branches = await useCase.listBranches();

        if (branches.length === 0) {
          printWarning("atelier/ ブランチが見つかりません");
          return;
        }

        const rows = branches.map((b) => {
          const nameDisplay = b.current
            ? COLORS.success(`* ${b.name}`)
            : `  ${b.name}`;
          const commitShort = b.commit.slice(0, 8);
          const worktreeDisplay = b.worktreePath
            ? COLORS.accent(path.relative(projectPath, b.worktreePath) || b.worktreePath)
            : COLORS.muted("-");
          return [nameDisplay, commitShort, b.label, worktreeDisplay];
        });

        printTable(["Branch", "Commit", "Label", "Worktree"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch merge <name>
  branch
    .command("merge <name>")
    .description("指定ブランチをメインブランチにマージし、worktree + ブランチを削除する")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`ブランチ '${name}' をマージ中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        const mergedTo = await useCase.mergeBranch(name);
        spinner.stop();
        printSuccess(`ブランチ '${name}' を '${mergedTo}' にマージしました`);
        printInfo("worktree とブランチを削除しました");
      } catch (error) {
        spinner.fail("マージに失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch delete <name>
  branch
    .command("delete <name>")
    .description("指定ブランチと worktree を削除する")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`ブランチ '${name}' を削除中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        await useCase.deleteBranch(name);
        spinner.stop();
        printSuccess(`ブランチ '${name}' と worktree を削除しました`);
      } catch (error) {
        spinner.fail("削除に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch retry <name>
  branch
    .command("retry <name>")
    .description("指定ブランチの worktree で Commission を再実行する")
    .option("--medium <name>", "使用する Medium を指定")
    .option("--direct", "Commission を使わず直接実行", false)
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`ブランチ '${name}' を再実行中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        const { branchName, worktreePath } = await useCase.retryBranch(name);

        // 前回の実行ログから Commission 名を取得
        let commissionName: string | undefined;
        let lastTaskDescription: string | undefined;

        try {
          const logsDir = path.join(resolveAtelierPath(projectPath), LOGS_DIR);
          if (await fileExists(logsDir)) {
            const logFiles = await listFiles(logsDir, ".json");
            // ブランチ名から runId を推定（atelier/run_XXXX -> run_XXXX）
            const runIdPart = branchName.replace("atelier/", "");

            // まずブランチ名に一致するログを探す
            for (const logFile of logFiles.reverse()) {
              const fileName = path.basename(logFile, ".json");
              if (fileName === runIdPart || logFile.includes(runIdPart)) {
                try {
                  const content = await readTextFile(logFile);
                  const result = JSON.parse(content) as RunResultDto;
                  commissionName = result.commissionName;
                  break;
                } catch {
                  // ignore
                }
              }
            }

            // 見つからなかった場合は最新のログから取得
            if (!commissionName && logFiles.length > 0) {
              try {
                const latestLog = logFiles[0]; // reversed, so this is the latest
                const content = await readTextFile(latestLog);
                const result = JSON.parse(content) as RunResultDto;
                commissionName = result.commissionName;
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ログ取得に失敗しても続行
        }

        // worktree 内で Commission を再実行
        if (opts.direct || !commissionName) {
          // --direct または Commission が不明な場合は直接実行
          spinner.text = "worktree 内で直接実行中...";

          // git log から元のタスク説明を取得
          try {
            const git = simpleGit(worktreePath);
            const log = await git.log({ maxCount: 1 });
            if (log.latest?.message) {
              const msg = log.latest.message;
              // "atelier: xxxx" 形式からタスク説明を取得
              const match = msg.match(/^atelier:\s*(.+)/);
              lastTaskDescription = match ? match[1] : msg;
            }
          } catch {
            // ignore
          }

          const taskDescription = lastTaskDescription ?? "前回のタスクを再実行してください。";
          const directUseCase = new DirectRunUseCase();
          const result = await directUseCase.execute(taskDescription, projectPath, {
            medium: opts.medium,
            worktreePath,
          });

          spinner.stop();

          if (result.status === "completed") {
            // コミット
            try {
              const git = simpleGit(worktreePath);
              const status = await git.status();
              if (status.files.length > 0) {
                await git.add("-A");
                await git.commit(`atelier: retry (${branchName})`);
              }
            } catch {
              // ignore
            }

            printSuccess(`再実行が完了しました`);
          } else {
            printError(`再実行が失敗しました (exitCode=${result.exitCode})`);
            if (result.stderr) {
              console.error(result.stderr.slice(0, 500));
            }
          }

          if (result.stdout) {
            console.log();
            console.log(result.stdout);
          }
        } else {
          // Commission 経由で再実行
          spinner.text = `Commission '${commissionName}' を worktree 内で再実行中...`;

          const configPort = createBranchConfigPort();
          const mediumRegistry = await createBranchMediumRegistry(projectPath);
          const eventBus = createEventBus();
          const vcsPort = createBranchNoopVcsPort();
          const loggerPort = createBranchLoggerPort();

          const commissionUseCase = new CommissionRunUseCase(
            configPort,
            vcsPort,
            loggerPort,
            mediumRegistry,
            eventBus,
          );

          // worktree 内で実行するため、worktreePath を projectPath として渡す
          const result = await commissionUseCase.execute(commissionName, worktreePath, {
            dryRun: false,
            medium: opts.medium,
          });

          spinner.stop();

          if (result.status === "completed") {
            // コミット
            try {
              const git = simpleGit(worktreePath);
              const status = await git.status();
              if (status.files.length > 0) {
                await git.add("-A");
                await git.commit(`atelier: retry commission '${commissionName}' (${branchName})`);
              }
            } catch {
              // ignore
            }

            printSuccess(
              `Commission '${commissionName}' の再実行が完了しました (${result.strokesExecuted} strokes, ${Math.round(result.duration / 1000)}s)`,
            );
          } else {
            printError(`再実行が失敗しました (status=${result.status})`);
            for (const err of result.errors) {
              printError(`  [${err.strokeName}] ${err.message}`);
            }
          }
        }

        console.log();
        printInfo(`ブランチ: ${branchName}`);
        printInfo(`Worktree: ${path.relative(projectPath, worktreePath) || worktreePath}`);
        console.log();
        printInfo("次のステップ:");
        console.log(`    atelier branch merge ${branchName}   # メインにマージ`);
        console.log(`    atelier branch delete ${branchName}  # 削除`);
        console.log(`    atelier branch retry ${branchName}   # 再実行`);
        console.log();
      } catch (error) {
        spinner.fail("再実行に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch instruct <name>
  branch
    .command("instruct <name>")
    .description("完了したタスクの worktree に対して追加指示を出して再実行する")
    .option("--medium <name>", "使用する Medium を指定")
    .option("--palette <name>", "使用する Palette を指定", "coder")
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();

      try {
        const branchUseCase = new ManageBranchesUseCase(projectPath);
        const { branchName, worktreePath } = await branchUseCase.retryBranch(name);

        console.log();
        console.log(COLORS.accent.bold("ATELIER Instruct Mode"));
        console.log(COLORS.muted("─".repeat(50)));
        printInfo(`ブランチ: ${branchName}`);
        printInfo(`Worktree: ${path.relative(projectPath, worktreePath) || worktreePath}`);
        console.log(COLORS.muted("追加の指示を入力してください。空行で実行、Ctrl+C でキャンセル。"));
        console.log(COLORS.muted("複数行入力可能です。"));
        console.log(COLORS.muted("─".repeat(50)));
        console.log();

        // 対話モードで追加指示を入力
        const lines: string[] = [];
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true,
        });

        const instruction = await new Promise<string>((resolve, reject) => {
          const promptLine = () => {
            rl.question(COLORS.accent("instruct > "), (answer) => {
              const trimmed = answer.trim();

              // 空行で確定
              if (trimmed === "" && lines.length > 0) {
                rl.close();
                resolve(lines.join("\n"));
                return;
              }

              if (trimmed === "/cancel") {
                rl.close();
                reject(new Error("キャンセルされました"));
                return;
              }

              if (trimmed) {
                lines.push(trimmed);
              }

              promptLine();
            });
          };

          rl.on("close", () => {
            if (lines.length > 0) {
              resolve(lines.join("\n"));
            } else {
              reject(new Error("指示が入力されませんでした"));
            }
          });

          promptLine();
        });

        console.log();
        printInfo(`指示内容: ${instruction.slice(0, 100)}${instruction.length > 100 ? "..." : ""}`);

        // --direct 実行（worktree 内で）
        const spinner = createSpinner("worktree 内で追加指示を実行中...").start();

        const directUseCase = new DirectRunUseCase();
        const result = await directUseCase.execute(instruction, projectPath, {
          medium: opts.medium,
          palette: opts.palette,
          worktreePath,
        });

        spinner.stop();

        if (result.status === "completed") {
          // コミット
          try {
            const git = simpleGit(worktreePath);
            const status = await git.status();
            if (status.files.length > 0) {
              await git.add("-A");
              await git.commit(`atelier: instruct (${branchName})\n\n${instruction.slice(0, 200)}`);
              printSuccess("変更をコミットしました");
            } else {
              printWarning("変更はありませんでした");
            }
          } catch (commitError) {
            printWarning(`コミットに失敗しました: ${commitError instanceof Error ? commitError.message : String(commitError)}`);
          }

          printSuccess(`追加指示の実行が完了しました (${Math.round(result.duration / 1000)}s)`);
        } else {
          printError(`追加指示の実行に失敗しました (exitCode=${result.exitCode})`);
          if (result.stderr) {
            console.error(result.stderr.slice(0, 500));
          }
        }

        if (result.stdout) {
          console.log();
          console.log(result.stdout);
        }

        console.log();
        printInfo(`ブランチ: ${branchName}`);
        printInfo(`Worktree: ${path.relative(projectPath, worktreePath) || worktreePath}`);
        console.log();
        printInfo("次のステップ:");
        console.log(`    atelier branch instruct ${branchName}  # さらに追加指示`);
        console.log(`    atelier branch merge ${branchName}     # メインにマージ`);
        console.log(`    atelier branch delete ${branchName}    # 削除`);
        console.log();
      } catch (error) {
        if (error instanceof Error && (error.message === "キャンセルされました" || error.message === "指示が入力されませんでした")) {
          printWarning(error.message);
        } else {
          printError(
            error instanceof Error ? error.message : String(error),
          );
          process.exitCode = 1;
        }
      }
    });

  return branch;
}
