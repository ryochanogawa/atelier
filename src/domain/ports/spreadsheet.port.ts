/**
 * Spreadsheet Port
 * スプレッドシートへの書き出しポート。
 */

import type { SpreadsheetDocument } from "../value-objects/sheet-operations.vo.js";

/** スプレッドシート書き出し結果 */
export interface SpreadsheetWriteResult {
  readonly spreadsheetId: string;
  readonly spreadsheetUrl: string;
}

export interface SpreadsheetPort {
  /**
   * スプレッドシートドキュメントを作成し、全シートを書き出す。
   * @returns スプレッドシートIDとURL
   */
  create(document: SpreadsheetDocument): Promise<SpreadsheetWriteResult>;

  /**
   * 既存スプレッドシートにドキュメントを上書き書き出す。
   */
  update(
    spreadsheetId: string,
    document: SpreadsheetDocument,
  ): Promise<SpreadsheetWriteResult>;
}
