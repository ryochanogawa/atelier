/**
 * ArpeggioRunner Service
 * CSV × テンプレート × バッチ処理エンジン。
 *
 * Commission YAML の stroke に `arpeggio` を指定すると:
 * 1. CSV ファイルからデータを読み込み
 * 2. 各行をテンプレートに展開
 * 3. バッチに分割して並列実行（セマフォで同時実行数を制御）
 * 4. 結果をマージ
 */

import { readFileSync } from "node:fs";
import type { ArpeggioConfig } from "../../domain/models/stroke.model.js";

// ─── Types ────────────────────────────────────────────────────────

/** CSV の1行をカラム名 → 値で保持する */
export type DataRow = Record<string, string>;

/** バッチ単位のデータ */
export interface DataBatch {
  /** このバッチに含まれる行 */
  readonly rows: readonly DataRow[];
  /** 0-based バッチインデックス */
  readonly batchIndex: number;
  /** 全バッチ数 */
  readonly totalBatches: number;
}

/** 1バッチの実行結果 */
export interface BatchResult {
  readonly batchIndex: number;
  readonly content: string;
  readonly success: boolean;
  readonly error?: string;
}

/** バッチごとに LLM を呼び出す関数の型 */
export type BatchExecutor = (expandedInstruction: string) => Promise<string>;

// ─── CSV Parser ───────────────────────────────────────────────────

/**
 * CSV 文字列をパースする。
 * クォートフィールド、エスケープクォート ("") 、\r\n / \r / \n に対応。
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
      continue;
    }

    if (char === '"' && currentField.length === 0) {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    if (char === "\r") {
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      if (i + 1 < content.length && content[i + 1] === "\n") {
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

// ─── Data Source ───────────────────────────────────────────────────

/**
 * CSV ファイルを読み込み、ヘッダー付き DataRow の配列をバッチ分割して返す。
 */
export function readCsvBatches(filePath: string, batchSize: number): DataBatch[] {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseCsv(content);

  if (parsed.length < 2) {
    throw new Error(`CSV file has no data rows: ${filePath}`);
  }

  const headers = parsed[0]!;
  const dataRows: DataRow[] = parsed.slice(1).map((row) => {
    const dataRow: DataRow = {};
    for (let col = 0; col < headers.length; col++) {
      dataRow[headers[col]!] = row[col] ?? "";
    }
    return dataRow;
  });

  // バッチ分割
  const chunks: DataRow[][] = [];
  for (let i = 0; i < dataRows.length; i += batchSize) {
    chunks.push(dataRows.slice(i, i + batchSize));
  }

  const totalBatches = chunks.length;
  return chunks.map((rows, index) => ({
    rows,
    batchIndex: index,
    totalBatches,
  }));
}

// ─── Template Expansion ───────────────────────────────────────────

/**
 * 行を "key: value" の改行区切りでフォーマットする。
 */
function formatRow(row: DataRow): string {
  return Object.entries(row)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/**
 * テンプレート内のプレースホルダーをバッチデータで展開する。
 *
 * サポートするプレースホルダー:
 * - {{batch_data}}     — 全行を "key: value" 形式で結合したテキスト
 * - {{batch_index}}    — 0-based バッチインデックス
 * - {{total_batches}}  — 全バッチ数
 * - {{line:N}}         — N番目の行（1-based）を "key: value" 形式で展開
 * - {{col:N:name}}     — N番目の行（1-based）のカラム name の値
 */
export function expandTemplate(template: string, batch: DataBatch): string {
  let result = template;

  // {{batch_data}} — 全行を結合
  result = result.replace(
    /\{\{batch_data\}\}/g,
    batch.rows.map((row) => formatRow(row)).join("\n---\n"),
  );

  // {{batch_index}} / {{total_batches}}
  result = result.replace(/\{\{batch_index\}\}/g, String(batch.batchIndex));
  result = result.replace(/\{\{total_batches\}\}/g, String(batch.totalBatches));

  // {{col:N:name}} — 先に処理（{{line:N}} との部分マッチを防ぐ）
  result = result.replace(
    /\{\{col:(\d+):(\w+)\}\}/g,
    (_match, indexStr: string, colName: string) => {
      const rowIndex = parseInt(indexStr, 10) - 1;
      if (rowIndex < 0 || rowIndex >= batch.rows.length) {
        throw new Error(
          `Template placeholder {{col:${indexStr}:${colName}}} references row ${indexStr} but batch has ${batch.rows.length} rows`,
        );
      }
      const row = batch.rows[rowIndex]!;
      const value = row[colName];
      if (value === undefined) {
        throw new Error(
          `Template placeholder {{col:${indexStr}:${colName}}} references unknown column "${colName}"`,
        );
      }
      return value;
    },
  );

  // {{line:N}}
  result = result.replace(
    /\{\{line:(\d+)\}\}/g,
    (_match, indexStr: string) => {
      const rowIndex = parseInt(indexStr, 10) - 1;
      if (rowIndex < 0 || rowIndex >= batch.rows.length) {
        throw new Error(
          `Template placeholder {{line:${indexStr}}} references row ${indexStr} but batch has ${batch.rows.length} rows`,
        );
      }
      return formatRow(batch.rows[rowIndex]!);
    },
  );

  return result;
}

// ─── Semaphore ────────────────────────────────────────────────────

/**
 * 並列数を制御するセマフォ。
 */
class Semaphore {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.running--;
    }
  }
}

// ─── Merge ────────────────────────────────────────────────────────

/**
 * バッチ結果をバッチインデックス順にソートし、成功したものを結合する。
 */
function mergeConcat(results: readonly BatchResult[], separator: string): string {
  return results
    .slice()
    .sort((a, b) => a.batchIndex - b.batchIndex)
    .filter((r) => r.success)
    .map((r) => r.content)
    .join(separator);
}

// ─── Runner ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1バッチをリトライ付きで実行する。
 */
async function executeBatchWithRetry(
  batch: DataBatch,
  instructionTemplate: string,
  executor: BatchExecutor,
  maxRetries: number,
  retryDelayMs: number,
): Promise<BatchResult> {
  const expandedInstruction = expandTemplate(instructionTemplate, batch);
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await executor(expandedInstruction);
      return {
        batchIndex: batch.batchIndex,
        content,
        success: true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(
        `[arpeggio] Batch ${batch.batchIndex} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError}`,
      );
      if (attempt < maxRetries) {
        await delay(retryDelayMs);
      }
    }
  }

  return {
    batchIndex: batch.batchIndex,
    content: "",
    success: false,
    error: lastError,
  };
}

/**
 * Arpeggio のメインエントリポイント。
 * CSV を読み込み、バッチに分割し、並列で executor を呼び出し、結果をマージして返す。
 *
 * @param config     Arpeggio 設定
 * @param instruction  テンプレート変数を含む instruction 文字列
 * @param executor   1バッチの展開済み instruction を受け取り LLM 結果を返す関数
 * @returns マージされた全バッチの結果文字列
 */
export async function runArpeggio(
  config: ArpeggioConfig,
  instruction: string,
  executor: BatchExecutor,
): Promise<string> {
  // 1. CSV 読み込み + バッチ分割
  const batches = readCsvBatches(config.sourcePath, config.batchSize);

  if (batches.length === 0) {
    throw new Error(`CSV data source returned no batches: ${config.sourcePath}`);
  }

  console.error(
    `[arpeggio] Loaded ${batches.length} batches (batchSize=${config.batchSize}, concurrency=${config.concurrency}) from ${config.sourcePath}`,
  );

  // 2. セマフォで並列数を制御しながらバッチ実行
  const semaphore = new Semaphore(config.concurrency);

  const promises = batches.map(async (batch) => {
    await semaphore.acquire();
    try {
      return await executeBatchWithRetry(
        batch,
        instruction,
        executor,
        config.maxRetries,
        config.retryDelayMs,
      );
    } finally {
      semaphore.release();
    }
  });

  const results = await Promise.all(promises);

  // 3. 失敗チェック
  const failedBatches = results.filter((r) => !r.success);
  if (failedBatches.length > 0) {
    const errorDetails = failedBatches
      .map((r) => `batch ${r.batchIndex}: ${r.error}`)
      .join("; ");
    throw new Error(
      `Arpeggio failed: ${failedBatches.length}/${results.length} batches failed (${errorDetails})`,
    );
  }

  // 4. マージ
  const separator = config.separator ?? "\n";
  return mergeConcat(results, separator);
}
