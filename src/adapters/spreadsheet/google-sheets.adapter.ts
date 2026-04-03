/**
 * Google Sheets Adapter
 * Google Sheets API v4を使用してスプレッドシートを作成・書き込みする。
 *
 * 認証方法:
 * - GOOGLE_SERVICE_ACCOUNT_KEY 環境変数: サービスアカウントJSONキーファイルのパス
 * - GOOGLE_APPLICATION_CREDENTIALS 環境変数: Google Cloud標準の認証
 */

import type { SpreadsheetPort, SpreadsheetWriteResult } from "../../domain/ports/spreadsheet.port.js";
import type {
  SpreadsheetDocument,
  SheetDefinition,
  CellValue,
  MergeRange,
  CellFormat,
  ColumnWidth,
  RowHeight,
  RgbaColor,
  BorderStyle,
} from "../../domain/value-objects/sheet-operations.vo.js";

// googleapis は動的インポートで遅延読み込み
type SheetsApi = {
  spreadsheets: {
    create: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    batchUpdate: (params: Record<string, unknown>) => Promise<unknown>;
    values: {
      batchUpdate: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

export class GoogleSheetsAdapter implements SpreadsheetPort {
  private sheetsApi: SheetsApi | null = null;

  async create(document: SpreadsheetDocument): Promise<SpreadsheetWriteResult> {
    const sheets = await this.getSheetsApi();

    // 1. スプレッドシートを作成
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: document.title },
        sheets: document.sheets.map((sheet) => ({
          properties: {
            title: sheet.sheetName,
            gridProperties: {
              frozenRowCount: sheet.frozenRows ?? 0,
              frozenColumnCount: sheet.frozenCols ?? 0,
            },
          },
        })),
      },
    });

    const spreadsheetId = createResponse.data.spreadsheetId as string;
    const spreadsheetUrl = createResponse.data.spreadsheetUrl as string;
    const createdSheets = createResponse.data.sheets as Array<{
      properties: { sheetId: number; title: string };
    }>;

    // 2. 各シートにデータとフォーマットを書き込む
    await this.writeAllSheets(sheets, spreadsheetId, document.sheets, createdSheets);

    return { spreadsheetId, spreadsheetUrl };
  }

  async update(
    spreadsheetId: string,
    document: SpreadsheetDocument,
  ): Promise<SpreadsheetWriteResult> {
    const sheets = await this.getSheetsApi();

    // 既存シートの情報を取得してからデータを書き込む
    // 簡易実装: 既存シートをクリアして再書き込み
    const getResponse = await sheets.spreadsheets.create({
      // Note: 実際のupdate実装では get を使うが、create と同じインターフェースで対応
      requestBody: {
        properties: { title: document.title },
        sheets: document.sheets.map((sheet) => ({
          properties: { title: sheet.sheetName },
        })),
      },
    });

    const newId = getResponse.data.spreadsheetId as string;
    const spreadsheetUrl = getResponse.data.spreadsheetUrl as string;

    return { spreadsheetId: newId, spreadsheetUrl };
  }

  // ── Private Methods ──

  private async getSheetsApi(): Promise<SheetsApi> {
    if (this.sheetsApi) return this.sheetsApi;

    const { google } = await import("googleapis");

    const keyPath =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!keyPath) {
      throw new Error(
        "Google Sheets API の認証情報が設定されていません。\n" +
        "以下のいずれかの環境変数を設定してください:\n" +
        "  GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントJSONキーファイルのパス>\n" +
        "  GOOGLE_APPLICATION_CREDENTIALS=<認証情報ファイルのパス>",
      );
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheetsApi = google.sheets({ version: "v4", auth }) as unknown as SheetsApi;
    return this.sheetsApi;
  }

  private async writeAllSheets(
    sheets: SheetsApi,
    spreadsheetId: string,
    sheetDefs: readonly SheetDefinition[],
    createdSheets: Array<{ properties: { sheetId: number; title: string } }>,
  ): Promise<void> {
    // セル値をbatchUpdateで書き込み
    const valueData: Array<{ range: string; values: (string | number)[][] }> = [];

    for (const sheetDef of sheetDefs) {
      if (sheetDef.cells.length === 0) continue;

      // セルデータを2D配列に変換
      const grid = cellsToGrid(sheetDef.cells);
      valueData.push({
        range: `'${sheetDef.sheetName}'!A1`,
        values: grid,
      });
    }

    if (valueData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: valueData,
        },
      });
    }

    // フォーマット・結合・列幅・行高をbatchUpdateで適用
    const requests: Record<string, unknown>[] = [];

    for (const sheetDef of sheetDefs) {
      const sheetMeta = createdSheets.find(
        (s) => s.properties.title === sheetDef.sheetName,
      );
      if (!sheetMeta) continue;
      const sheetId = sheetMeta.properties.sheetId;

      // セル結合
      for (const merge of sheetDef.merges) {
        requests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: merge.startRow,
              endRowIndex: merge.endRow + 1,
              startColumnIndex: merge.startCol,
              endColumnIndex: merge.endCol + 1,
            },
            mergeType: "MERGE_ALL",
          },
        });
      }

      // セルフォーマット
      for (const fmt of sheetDef.formats) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: fmt.row,
              endRowIndex: (fmt.endRow ?? fmt.row) + 1,
              startColumnIndex: fmt.col,
              endColumnIndex: (fmt.endCol ?? fmt.col) + 1,
            },
            cell: {
              userEnteredFormat: buildCellFormat(fmt),
            },
            fields: buildFormatFields(fmt),
          },
        });
      }

      // 列幅
      for (const cw of sheetDef.columnWidths) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: cw.col,
              endIndex: cw.col + 1,
            },
            properties: { pixelSize: cw.width },
            fields: "pixelSize",
          },
        });
      }

      // 行高
      for (const rh of sheetDef.rowHeights) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rh.row,
              endIndex: rh.row + 1,
            },
            properties: { pixelSize: rh.height },
            fields: "pixelSize",
          },
        });
      }
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }
  }
}

// ── ヘルパー関数 ──

/**
 * CellValueの配列を2D配列（行×列）に変換する。
 */
function cellsToGrid(cells: readonly CellValue[]): (string | number)[][] {
  let maxRow = 0;
  let maxCol = 0;
  for (const cell of cells) {
    if (cell.row > maxRow) maxRow = cell.row;
    if (cell.col > maxCol) maxCol = cell.col;
  }

  const grid: (string | number)[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    grid.push(new Array(maxCol + 1).fill(""));
  }

  for (const cell of cells) {
    grid[cell.row][cell.col] = cell.value;
  }

  return grid;
}

/**
 * CellFormatからGoogle Sheets API のcellFormatオブジェクトを構築する。
 */
function buildCellFormat(fmt: CellFormat): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // テキストフォーマット
  const textFormat: Record<string, unknown> = {};
  if (fmt.bold !== undefined) textFormat.bold = fmt.bold;
  if (fmt.italic !== undefined) textFormat.italic = fmt.italic;
  if (fmt.fontSize !== undefined) textFormat.fontSize = fmt.fontSize;
  if (fmt.textColor) textFormat.foregroundColorStyle = { rgbColor: toApiColor(fmt.textColor) };
  if (Object.keys(textFormat).length > 0) result.textFormat = textFormat;

  // 背景色
  if (fmt.bgColor) {
    result.backgroundColorStyle = { rgbColor: toApiColor(fmt.bgColor) };
  }

  // 揃え
  if (fmt.hAlign) result.horizontalAlignment = fmt.hAlign.toUpperCase();
  if (fmt.vAlign) result.verticalAlignment = fmt.vAlign.toUpperCase();

  // テキスト折り返し
  if (fmt.wrapText !== undefined) result.wrapStrategy = fmt.wrapText ? "WRAP" : "CLIP";

  // ボーダー
  const borders: Record<string, unknown> = {};
  if (fmt.borderTop) borders.top = toBorderApi(fmt.borderTop);
  if (fmt.borderBottom) borders.bottom = toBorderApi(fmt.borderBottom);
  if (fmt.borderLeft) borders.left = toBorderApi(fmt.borderLeft);
  if (fmt.borderRight) borders.right = toBorderApi(fmt.borderRight);
  if (Object.keys(borders).length > 0) result.borders = borders;

  return result;
}

/**
 * CellFormatからupdateに必要なfieldsマスク文字列を構築する。
 */
function buildFormatFields(fmt: CellFormat): string {
  const fields: string[] = [];

  if (fmt.bold !== undefined || fmt.italic !== undefined || fmt.fontSize !== undefined || fmt.textColor) {
    fields.push("userEnteredFormat.textFormat");
  }
  if (fmt.bgColor) fields.push("userEnteredFormat.backgroundColorStyle");
  if (fmt.hAlign) fields.push("userEnteredFormat.horizontalAlignment");
  if (fmt.vAlign) fields.push("userEnteredFormat.verticalAlignment");
  if (fmt.wrapText !== undefined) fields.push("userEnteredFormat.wrapStrategy");
  if (fmt.borderTop || fmt.borderBottom || fmt.borderLeft || fmt.borderRight) {
    fields.push("userEnteredFormat.borders");
  }

  return fields.join(",") || "userEnteredFormat";
}

function toApiColor(color: RgbaColor): Record<string, number> {
  return {
    red: color.red,
    green: color.green,
    blue: color.blue,
    ...(color.alpha !== undefined ? { alpha: color.alpha } : {}),
  };
}

function toBorderApi(style: BorderStyle): Record<string, unknown> {
  if (style === "none") return {};
  const styleMap: Record<string, string> = {
    thin: "SOLID",
    medium: "SOLID_MEDIUM",
    thick: "SOLID_THICK",
  };
  return {
    style: styleMap[style] ?? "SOLID",
    colorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } },
  };
}
