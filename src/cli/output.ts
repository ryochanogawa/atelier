/**
 * Output Formatter
 * CLI 出力のフォーマッター。テーマ対応のテーブル表示、JSON出力モードをサポート。
 */

import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import type { Ora } from "ora";
import type { RunResultDto } from "../application/dto/run-result.dto.js";
import { formatDuration } from "../shared/utils.js";
import { COLORS, SYMBOLS, BORDERS, TABLE_STYLE } from "./theme.js";

export type OutputFormat = "table" | "json";

let outputFormat: OutputFormat = "table";

export function setOutputFormat(format: OutputFormat): void {
  outputFormat = format;
}

export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

export function isDecorated(): boolean {
  if (outputFormat === "json") return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

export function printHeader(title: string): void {
  if (!isDecorated()) return;

  const columns = process.stdout.columns ?? 80;
  if (columns < 40) {
    console.log(title);
    return;
  }

  const innerWidth = Math.min(columns - 2, 60);
  const top = BORDERS.topLeft + BORDERS.horizontal.repeat(innerWidth) + BORDERS.topRight;
  const bottom = BORDERS.bottomLeft + BORDERS.horizontal.repeat(innerWidth) + BORDERS.bottomRight;
  const pad = Math.max(0, Math.floor((innerWidth - title.length) / 2));
  const titleLine = BORDERS.vertical + " ".repeat(pad) + title + " ".repeat(innerWidth - pad - title.length) + BORDERS.vertical;

  console.log(COLORS.primary(top));
  console.log(COLORS.primary(titleLine));
  console.log(COLORS.primary(bottom));
}

export function printSectionDivider(title: string): void {
  if (!isDecorated()) {
    console.log(`--- ${title} ---`);
    return;
  }

  const columns = process.stdout.columns ?? 80;
  const totalWidth = Math.min(columns, 60);
  const inner = `${BORDERS.titleLeft} ${title} ${BORDERS.titleRight}`;
  const sideLen = Math.max(0, Math.floor((totalWidth - inner.length) / 2));
  const line = BORDERS.horizontal.repeat(sideLen) + inner + BORDERS.horizontal.repeat(sideLen);

  console.log(COLORS.accent(line));
}

export function printRunResult(result: RunResultDto): void {
  if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const decorated = isDecorated();

  const statusConfig = result.status === "completed"
    ? { color: decorated ? COLORS.success : chalk.green, symbol: SYMBOLS.success, label: "completed" }
    : result.status === "failed"
      ? { color: decorated ? COLORS.error : chalk.red, symbol: SYMBOLS.error, label: "failed" }
      : { color: decorated ? COLORS.warning : chalk.yellow, symbol: SYMBOLS.warning, label: result.status };

  if (decorated) {
    const innerWidth = 56;
    const top = BORDERS.topLeft + BORDERS.horizontal.repeat(innerWidth) + BORDERS.topRight;
    const bottom = BORDERS.bottomLeft + BORDERS.horizontal.repeat(innerWidth) + BORDERS.bottomRight;

    const padLine = (label: string, value: string): string => {
      const content = `  ${label}: ${value}`;
      const padding = Math.max(0, innerWidth - content.length);
      return BORDERS.vertical + content + " ".repeat(padding) + BORDERS.vertical;
    };

    const titleText = `${SYMBOLS.biohazard} Commission 実行結果`;
    const titlePad = Math.max(0, innerWidth - titleText.length);
    const titleLine = BORDERS.vertical + titleText + " ".repeat(titlePad) + BORDERS.vertical;

    console.log();
    console.log(COLORS.primary(top));
    console.log(COLORS.primary(titleLine));
    console.log(COLORS.primary(BORDERS.vertical + BORDERS.horizontal.repeat(innerWidth) + BORDERS.vertical));
    console.log(padLine("Run ID", result.runId));
    console.log(padLine("Commission", result.commissionName));
    console.log(padLine("Status", statusConfig.color(`${statusConfig.symbol} ${statusConfig.label}`)));
    console.log(padLine("Strokes", `${result.strokesExecuted} / ${result.strokesTotal}`));
    console.log(padLine("Duration", formatDuration(result.duration)));
    console.log(padLine("Started", result.startedAt));
    console.log(padLine("Completed", result.completedAt));

    if (result.errors.length > 0) {
      console.log(COLORS.primary(BORDERS.vertical + BORDERS.horizontal.repeat(innerWidth) + BORDERS.vertical));
      const errTitle = `  ${SYMBOLS.error} Errors`;
      console.log(COLORS.error(BORDERS.vertical + errTitle + " ".repeat(Math.max(0, innerWidth - errTitle.length)) + BORDERS.vertical));
      for (const err of result.errors) {
        const errLine = `    [${err.strokeName}] ${err.message}`;
        const errPad = Math.max(0, innerWidth - errLine.length);
        console.log(COLORS.error(BORDERS.vertical + errLine + " ".repeat(errPad) + BORDERS.vertical));
      }
    }

    console.log(COLORS.primary(bottom));
    console.log();
  } else {
    console.log();
    console.log(chalk.bold("Commission 実行結果"));
    console.log(chalk.dim("\u2500".repeat(50)));

    const table = new Table({
      colWidths: [20, 40],
      style: { head: [], border: [] },
    });

    table.push(
      ["Run ID", result.runId],
      ["Commission", result.commissionName],
      ["Status", statusConfig.color(`${statusConfig.symbol} ${statusConfig.label}`)],
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
        console.log(chalk.red(`  [${err.strokeName}] ${err.message}`));
      }
    }

    console.log();
  }
}

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

  const decorated = isDecorated();
  const table = new Table({
    head: headers.map((h) => decorated ? COLORS.accent(h) : chalk.cyan(h)),
    ...(decorated ? { chars: TABLE_STYLE } : {}),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

export function printSuccess(message: string): void {
  if (isDecorated()) {
    console.log(COLORS.success(`${SYMBOLS.success} ${message}`));
  } else {
    console.log(chalk.green(`${SYMBOLS.success} ${message}`));
  }
}

export function printError(message: string): void {
  if (isDecorated()) {
    console.error(COLORS.error(`${SYMBOLS.error} ${message}`));
  } else {
    console.error(chalk.red(`${SYMBOLS.error} ${message}`));
  }
}

export function printWarning(message: string): void {
  if (isDecorated()) {
    console.log(COLORS.warning(`${SYMBOLS.warning} ${message}`));
  } else {
    console.log(chalk.yellow(`${SYMBOLS.warning} ${message}`));
  }
}

export function printInfo(message: string): void {
  if (isDecorated()) {
    console.log(COLORS.info(`${SYMBOLS.info} ${message}`));
  } else {
    console.log(chalk.blue(`${SYMBOLS.info} ${message}`));
  }
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "yellow",
    isEnabled: process.stdout.isTTY !== undefined && process.stdout.isTTY,
  });
}

export function printProgressBar(current: number, total: number, label?: string): void {
  if (outputFormat === "json") return;

  const barWidth = 20;
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(barWidth * ratio);
  const empty = barWidth - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const suffix = label ? ` ${label}` : "";
  const text = `[${bar}] ${current}/${total}${suffix}`;

  if (isDecorated()) {
    console.log(COLORS.accent(text));
  } else {
    console.log(text);
  }
}
