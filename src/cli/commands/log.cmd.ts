/**
 * Log Commands
 * atelier log <run-id> / atelier log tail
 */

import { Command } from "commander";
import path from "node:path";
import { resolveAtelierPath } from "../../shared/utils.js";
import { LOGS_DIR } from "../../shared/constants.js";
import {
  readTextFile,
  fileExists,
  listFiles,
} from "../../infrastructure/fs/file-system.js";
import {
  printError,
  printWarning,
  printInfo,
  printTable,
} from "../output.js";
import type { RunResultDto } from "../../application/dto/run-result.dto.js";
import { formatDuration } from "../../shared/utils.js";

export function createLogCommand(): Command {
  const log = new Command("log")
    .description("実行ログの表示");

  // log show <run-id>
  log
    .command("show <run-id>")
    .description("指定した Run ID のログを表示")
    .action(async (runId: string) => {
      const projectPath = process.cwd();
      const logsDir = path.join(resolveAtelierPath(projectPath), LOGS_DIR);
      const logPath = path.join(logsDir, `${runId}.json`);

      if (!(await fileExists(logPath))) {
        printError(`ログが見つかりません: ${runId}`);
        process.exitCode = 1;
        return;
      }

      try {
        const content = await readTextFile(logPath);
        const result = JSON.parse(content) as RunResultDto;

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        printError(
          `ログの読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      }
    });

  // log tail
  log
    .command("tail")
    .description("最新のログを一覧表示")
    .option("-n, --count <number>", "表示件数", "10")
    .action(async (opts) => {
      const projectPath = process.cwd();
      const logsDir = path.join(resolveAtelierPath(projectPath), LOGS_DIR);

      try {
        const files = await listFiles(logsDir, ".json");

        if (files.length === 0) {
          printWarning("ログがありません");
          return;
        }

        // 最新のファイルから指定件数分取得
        const count = parseInt(opts.count, 10) || 10;
        const recentFiles = files.slice(-count);

        const rows: string[][] = [];
        for (const file of recentFiles) {
          try {
            const content = await readTextFile(file);
            const result = JSON.parse(content) as RunResultDto;
            rows.push([
              result.runId,
              result.commissionName,
              result.status,
              `${result.strokesExecuted}/${result.strokesTotal}`,
              formatDuration(result.duration),
              result.startedAt,
            ]);
          } catch {
            // 不正なログファイルはスキップ
          }
        }

        if (rows.length === 0) {
          printWarning("有効なログがありません");
          return;
        }

        printInfo("最近の実行ログ:");
        printTable(
          ["Run ID", "Commission", "Status", "Strokes", "Duration", "Started"],
          rows,
        );
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return log;
}
