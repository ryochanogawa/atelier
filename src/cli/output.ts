/**
 * Output Formatter
 * CLI 出力のフォーマッター。テーブル表示、JSON出力モードをサポート。
 */

import chalk from "chalk";
import Table from "cli-table3";
import type { RunResultDto } from "../application/dto/run-result.dto.js";
import { formatDuration } from "../shared/utils.js";

export type OutputFormat = "table" | "json";

let outputFormat: OutputFormat = "table";

export function setOutputFormat(format: OutputFormat): void {
  outputFormat = format;
}

export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

/**
 * 実行結果を表示する。
 */
export function printRunResult(result: RunResultDto): void {
  if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const statusColor =
    result.status === "completed"
      ? chalk.green
      : result.status === "failed"
        ? chalk.red
        : chalk.yellow;

  console.log();
  console.log(chalk.bold("Commission 実行結果"));
  console.log(chalk.dim("─".repeat(50)));

  const table = new Table({
    colWidths: [20, 40],
    style: { head: [], border: [] },
  });

  table.push(
    ["Run ID", result.runId],
    ["Commission", result.commissionName],
    ["Status", statusColor(result.status)],
    ["Strokes", `${result.strokesExecuted} / ${result.strokesTotal}`],
    ["Duration", formatDuration(result.duration)],
    ["Started", result.startedAt],
    ["Completed", result.completedAt],
  );

  console.log(table.toString());

  if (result.errors.length > 0) {
    console.log();
    console.log(chalk.red.bold("Errors:"));
    for (const err of result.errors) {
      console.log(
        chalk.red(`  [${err.strokeName}] ${err.message}`),
      );
    }
  }

  console.log();
}

/**
 * テーブルを表示する。
 */
export function printTable(
  headers: string[],
  rows: string[][],
): void {
  if (outputFormat === "json") {
    const data = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      return obj;
    });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const table = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

/**
 * 成功メッセージ。
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * エラーメッセージ。
 */
export function printError(message: string): void {
  console.error(chalk.red(`✗ ${message}`));
}

/**
 * 警告メッセージ。
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * 情報メッセージ。
 */
export function printInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}
