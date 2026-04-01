/**
 * Output Formatter
 * CLI 出力のフォーマッター。ThemePort によるテーマ注入、テーブル表示、JSON出力モードをサポート。
 * RenderMode により TUI (Ink) / classic (chalk) / json を切り替える。
 */

import chalk from "chalk";
import type { ChalkInstance } from "chalk";
import Table from "cli-table3";
import ora from "ora";
import type { Ora } from "ora";
import React from "react";
import type { RunResultDto } from "../application/dto/run-result.dto.js";
import type { ThemePort, ThemeColors } from "../domain/ports/theme.port.js";
import { formatDuration } from "../shared/utils.js";
import { BIOHAZARD_THEME } from "../adapters/theme/biohazard.adapter.js";

// ─── Render Mode ───────────────────────────────────────────────

export type RenderMode = "tui" | "classic" | "json";
export type OutputFormat = "table" | "json";

let renderMode: RenderMode = "classic";
let outputFormat: OutputFormat = "table";

/** TUI モジュールのキャッシュ（initializeRenderMode で事前ロード） */
let tuiComponents: typeof import("./tui/index.js") | null = null;
let tuiRender: typeof import("./tui/render.js") | null = null;

/** レンダリングモードを判定する */
export function resolveRenderMode(opts: {
  readonly json: boolean;
  readonly noTui: boolean;
}): RenderMode {
  if (opts.json) return "json";
  if (opts.noTui) return "classic";
  if (process.env.NO_COLOR !== undefined) return "classic";
  if (process.env.CI !== undefined) return "classic";
  if (!process.stdout.isTTY) return "classic";
  return "tui";
}

/** レンダリングモードを初期化し、TUI モジュールを事前ロードする */
export async function initializeRenderMode(mode: RenderMode): Promise<void> {
  renderMode = mode;
  if (mode === "json") {
    outputFormat = "json";
  }
  if (mode === "tui") {
    const [components, renderer] = await Promise.all([
      import("./tui/index.js"),
      import("./tui/render.js"),
    ]);
    tuiComponents = components;
    tuiRender = renderer;
  }
}

/** 現在のレンダリングモードを取得 */
export function getRenderMode(): RenderMode {
  return renderMode;
}

/** TUI モードかどうか */
export function isTuiMode(): boolean {
  return renderMode === "tui";
}

// ─── Theme ─────────────────────────────────────────────────────

/** 現在のテーマ */
let currentTheme: ThemePort = BIOHAZARD_THEME;

/** chalk.hex() でラップ済みカラー関数マップ */
type ResolvedColorFns = { readonly [K in keyof ThemeColors]: ChalkInstance };
let colorFns: ResolvedColorFns = resolveColors(BIOHAZARD_THEME.colors);

function resolveColors(colors: ThemeColors): ResolvedColorFns {
  return Object.fromEntries(
    Object.entries(colors).map(([k, v]) => [k, chalk.hex(v)]),
  ) as unknown as ResolvedColorFns;
}

/** テーマを初期化（CLI bootstrap 時に1回呼ぶ） */
export function initializeTheme(theme: ThemePort): void {
  currentTheme = theme;
  colorFns = resolveColors(theme.colors);
}

/** 現在のテーマを取得 */
export function getCurrentTheme(): ThemePort {
  return currentTheme;
}

/** テーマカラーの chalk 関数を取得（コマンド層から利用） */
export function getColorFn(key: keyof ThemeColors): ChalkInstance {
  return colorFns[key];
}

export function setOutputFormat(format: OutputFormat): void {
  outputFormat = format;
  if (format === "json") {
    renderMode = "json";
  } else if (renderMode === "json") {
    renderMode = "classic";
  }
}

export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

// ─── TUI Render Helper ────────────────────────────────────────

/** TUI モード時に Ink で静的コンテンツを描画する（同期） */
function renderTuiStatic(element: React.ReactElement): void {
  tuiRender!.renderStatic(element, currentTheme);
}

// ─── Utility ──────────────────────────────────────────────────

export function isDecorated(): boolean {
  if (outputFormat === "json") return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

// ─── Output Functions ─────────────────────────────────────────

export function printHeader(title: string): void {
  if (renderMode === "json") return;

  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.Header, { title }));
    return;
  }

  // classic mode
  if (!isDecorated()) return;

  const columns = process.stdout.columns ?? 80;
  if (columns < 40) {
    console.log(title);
    return;
  }

  const borders = currentTheme.borders;
  const innerWidth = Math.min(columns - 2, 60);
  const top = borders.topLeft + borders.horizontal.repeat(innerWidth) + borders.topRight;
  const bottom = borders.bottomLeft + borders.horizontal.repeat(innerWidth) + borders.bottomRight;
  const pad = Math.max(0, Math.floor((innerWidth - title.length) / 2));
  const titleLine = borders.vertical + " ".repeat(pad) + title + " ".repeat(innerWidth - pad - title.length) + borders.vertical;

  console.log(colorFns.primary(top));
  console.log(colorFns.primary(titleLine));
  console.log(colorFns.primary(bottom));
}

export function printSectionDivider(title: string): void {
  if (renderMode === "json") return;

  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.SectionDivider, { title }));
    return;
  }

  if (!isDecorated()) {
    console.log(`--- ${title} ---`);
    return;
  }

  const borders = currentTheme.borders;
  const columns = process.stdout.columns ?? 80;
  const totalWidth = Math.min(columns, 60);
  const inner = `${borders.titleLeft} ${title} ${borders.titleRight}`;
  const sideLen = Math.max(0, Math.floor((totalWidth - inner.length) / 2));
  const line = borders.horizontal.repeat(sideLen) + inner + borders.horizontal.repeat(sideLen);

  console.log(colorFns.accent(line));
}

export function printRunResult(result: RunResultDto): void {
  if (renderMode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(
      React.createElement(tuiComponents.RunResult, {
        runId: result.runId,
        commissionName: result.commissionName,
        status: result.status,
        strokesExecuted: result.strokesExecuted,
        strokesTotal: result.strokesTotal,
        duration: formatDuration(result.duration),
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        errors: result.errors,
      }),
    );
    return;
  }

  // classic mode
  const decorated = isDecorated();
  const symbols = currentTheme.symbols;
  const borders = currentTheme.borders;

  const statusConfig = result.status === "completed"
    ? { color: decorated ? colorFns.success : chalk.green, symbol: symbols.success, label: "completed" }
    : result.status === "failed"
      ? { color: decorated ? colorFns.error : chalk.red, symbol: symbols.error, label: "failed" }
      : { color: decorated ? colorFns.warning : chalk.yellow, symbol: symbols.warning, label: result.status };

  if (decorated) {
    const innerWidth = 56;
    const top = borders.topLeft + borders.horizontal.repeat(innerWidth) + borders.topRight;
    const bottom = borders.bottomLeft + borders.horizontal.repeat(innerWidth) + borders.bottomRight;

    const padLine = (label: string, value: string): string => {
      const content = `  ${label}: ${value}`;
      const padding = Math.max(0, innerWidth - content.length);
      return borders.vertical + content + " ".repeat(padding) + borders.vertical;
    };

    const titleText = `${symbols.brand} Commission 実行結果`;
    const titlePad = Math.max(0, innerWidth - titleText.length);
    const titleLine = borders.vertical + titleText + " ".repeat(titlePad) + borders.vertical;

    console.log();
    console.log(colorFns.primary(top));
    console.log(colorFns.primary(titleLine));
    console.log(colorFns.primary(borders.vertical + borders.horizontal.repeat(innerWidth) + borders.vertical));
    console.log(padLine("Run ID", result.runId));
    console.log(padLine("Commission", result.commissionName));
    console.log(padLine("Status", statusConfig.color(`${statusConfig.symbol} ${statusConfig.label}`)));
    console.log(padLine("Strokes", `${result.strokesExecuted} / ${result.strokesTotal}`));
    console.log(padLine("Duration", formatDuration(result.duration)));
    console.log(padLine("Started", result.startedAt));
    console.log(padLine("Completed", result.completedAt));

    if (result.errors.length > 0) {
      console.log(colorFns.primary(borders.vertical + borders.horizontal.repeat(innerWidth) + borders.vertical));
      const errTitle = `  ${symbols.error} Errors`;
      console.log(colorFns.error(borders.vertical + errTitle + " ".repeat(Math.max(0, innerWidth - errTitle.length)) + borders.vertical));
      for (const err of result.errors) {
        const errLine = `    [${err.strokeName}] ${err.message}`;
        const errPad = Math.max(0, innerWidth - errLine.length);
        console.log(colorFns.error(borders.vertical + errLine + " ".repeat(errPad) + borders.vertical));
      }
    }

    console.log(colorFns.primary(bottom));
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
  if (renderMode === "json") {
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

  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.DataTable, { headers, rows }));
    return;
  }

  // classic mode
  const decorated = isDecorated();
  const table = new Table({
    head: headers.map((h) => decorated ? colorFns.accent(h) : chalk.cyan(h)),
    ...(decorated ? { chars: currentTheme.tableStyle } : {}),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

export function printSuccess(message: string): void {
  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.SuccessMessage, { message }));
    return;
  }

  if (isDecorated()) {
    console.log(colorFns.success(`${currentTheme.symbols.success} ${message}`));
  } else {
    console.log(chalk.green(`${currentTheme.symbols.success} ${message}`));
  }
}

export function printError(message: string): void {
  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.ErrorMessage, { message }));
    return;
  }

  if (isDecorated()) {
    console.error(colorFns.error(`${currentTheme.symbols.error} ${message}`));
  } else {
    console.error(chalk.red(`${currentTheme.symbols.error} ${message}`));
  }
}

export function printWarning(message: string): void {
  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.WarningMessage, { message }));
    return;
  }

  if (isDecorated()) {
    console.log(colorFns.warning(`${currentTheme.symbols.warning} ${message}`));
  } else {
    console.log(chalk.yellow(`${currentTheme.symbols.warning} ${message}`));
  }
}

export function printInfo(message: string): void {
  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.InfoMessage, { message }));
    return;
  }

  if (isDecorated()) {
    console.log(colorFns.info(`${currentTheme.symbols.info} ${message}`));
  } else {
    console.log(chalk.blue(`${currentTheme.symbols.info} ${message}`));
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
  if (renderMode === "json") return;

  if (renderMode === "tui" && tuiComponents) {
    renderTuiStatic(React.createElement(tuiComponents.ProgressBar, { current, total, label }));
    return;
  }

  const barWidth = 20;
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(barWidth * ratio);
  const empty = barWidth - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const suffix = label ? ` ${label}` : "";
  const text = `[${bar}] ${current}/${total}${suffix}`;

  if (isDecorated()) {
    console.log(colorFns.accent(text));
  } else {
    console.log(text);
  }
}
