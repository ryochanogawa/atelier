/**
 * Spreadsheet Formatter Service
 * 顧客向け要件定義DTOをスプレッドシートドキュメントに変換する。
 * 参考フォーマットに合わせた1シート帳票形式レイアウトを生成する。
 * 46列(col 0-45)を使用し、セル結合で帳票レイアウトを構成する。
 */

import type { ClientRequirementsDto } from "../dto/client-requirements.dto.js";
import type {
  SpreadsheetDocument,
  SheetDefinition,
  CellValue,
  MergeRange,
  CellFormat,
  ColumnWidth,
  RowHeight,
  RgbaColor,
} from "../../domain/value-objects/sheet-operations.vo.js";

// ── スタイル定数 ──

/** ヘッダーラベル背景色（水色） */
const COLOR_HEADER_BG: RgbaColor = { red: 0.6, green: 0.8, blue: 1.0 };
/** 黒テキスト */
const COLOR_BLACK: RgbaColor = { red: 0, green: 0, blue: 0 };
/** 白背景 */
const COLOR_WHITE: RgbaColor = { red: 1, green: 1, blue: 1 };

/** 総列数 */
const TOTAL_COLS = 46;

// ── ヘルパー関数 ──

/** ヘッダーラベルセル（水色背景、黒テキスト、中央揃え、罫線） */
function headerFmt(row: number, col: number, endCol?: number, endRow?: number): CellFormat {
  return {
    row, col,
    ...(endCol !== undefined ? { endCol } : {}),
    ...(endRow !== undefined ? { endRow } : {}),
    bold: false,
    fontSize: 10,
    bgColor: COLOR_HEADER_BG,
    textColor: COLOR_BLACK,
    hAlign: "center",
    vAlign: "middle",
    borderTop: "thin",
    borderBottom: "thin",
    borderLeft: "thin",
    borderRight: "thin",
  };
}

/** データセル（白背景、罫線） */
function dataFmt(row: number, col: number, extra?: Partial<CellFormat>): CellFormat {
  return {
    row, col,
    fontSize: 10,
    bgColor: COLOR_WHITE,
    textColor: COLOR_BLACK,
    vAlign: "middle",
    borderTop: "thin",
    borderBottom: "thin",
    borderLeft: "thin",
    borderRight: "thin",
    ...extra,
  };
}

/** セクションヘッダー（水色背景、全幅） */
function sectionHeaderFmt(row: number): CellFormat {
  return headerFmt(row, 0, TOTAL_COLS - 1);
}

/** 区切り線（全列に罫線を適用） */
function separatorFmt(row: number): CellFormat {
  return {
    row, col: 0, endCol: TOTAL_COLS - 1,
    bgColor: COLOR_WHITE,
    borderTop: "thin",
    borderBottom: "thin",
    borderLeft: "thin",
    borderRight: "thin",
  };
}

// ── メインエントリポイント ──

/**
 * ClientRequirementsDtoからスプレッドシートドキュメントを生成する。
 * 1シートに帳票形式で全データをまとめて出力する。
 */
export function formatClientRequirements(
  data: ClientRequirementsDto,
): SpreadsheetDocument {
  const sheet = buildReportSheet(data);
  return {
    title: `${data.projectInfo.projectName} - 要件定義書`,
    sheets: [sheet],
  };
}

// ── 帳票シート構築 ──

function buildReportSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  const rowHeights: RowHeight[] = [];
  let row = 0;

  // ====================================================
  // Row 0: ヘッダーラベル行
  //   管理ID(col0-3) | プロジェクト名(col4-11) | サブシステム名(col12-17) | タイトル(col18-45)
  // ====================================================
  cells.push({ row, col: 0, value: "管理ID" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 3 });
  formats.push(headerFmt(row, 0, 3));

  cells.push({ row, col: 4, value: "プロジェクト名" });
  merges.push({ startRow: row, endRow: row, startCol: 4, endCol: 11 });
  formats.push(headerFmt(row, 4, 11));

  cells.push({ row, col: 12, value: "サブシステム名" });
  merges.push({ startRow: row, endRow: row, startCol: 12, endCol: 17 });
  formats.push(headerFmt(row, 12, 17));

  cells.push({ row, col: 18, value: "タイトル" });
  merges.push({ startRow: row, endRow: row, startCol: 18, endCol: 45 });
  formats.push(headerFmt(row, 18, 45));

  rowHeights.push({ row, height: 28 });
  row++;

  // ====================================================
  // Row 1: 値入力欄
  // ====================================================
  cells.push({ row, col: 0, value: "" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 3 });
  formats.push(dataFmt(row, 0, { endCol: 3, hAlign: "center" }));

  cells.push({ row, col: 4, value: data.projectInfo.projectName });
  merges.push({ startRow: row, endRow: row, startCol: 4, endCol: 11 });
  formats.push(dataFmt(row, 4, { endCol: 11, hAlign: "center", fontSize: 12 }));

  cells.push({ row, col: 12, value: "" });
  merges.push({ startRow: row, endRow: row, startCol: 12, endCol: 17 });
  formats.push(dataFmt(row, 12, { endCol: 17, hAlign: "center" }));

  cells.push({ row, col: 18, value: data.projectInfo.documentTitle || "要件定義書" });
  merges.push({ startRow: row, endRow: row, startCol: 18, endCol: 45 });
  formats.push(dataFmt(row, 18, { endCol: 45, hAlign: "center", fontSize: 14 }));

  rowHeights.push({ row, height: 28 });
  row++;

  // ====================================================
  // Row 2-3: 空行
  // ====================================================
  row += 2;

  // ====================================================
  // Row 4: 区切り線
  // ====================================================
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(separatorFmt(row));
  rowHeights.push({ row, height: 8 });
  row++;

  // ====================================================
  // Row 5: ＩＤ－ＮＯ(col0-2) | タイプ(col3-9) | 実行環境(col10-45)
  // ====================================================
  cells.push({ row, col: 0, value: "ＩＤ－ＮＯ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 2 });
  formats.push(headerFmt(row, 0, 2));

  cells.push({ row, col: 3, value: "タイプ" });
  merges.push({ startRow: row, endRow: row, startCol: 3, endCol: 9 });
  formats.push(headerFmt(row, 3, 9));

  cells.push({ row, col: 10, value: "実行環境" });
  merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
  formats.push(headerFmt(row, 10, 45));

  rowHeights.push({ row, height: 28 });
  row++;

  // ====================================================
  // Row 6: 概要(col0-2) | ■画面　□バッチ処理(col3-9) | 値入力欄(col10-45)
  // ====================================================
  cells.push({ row, col: 0, value: "概要" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 2 });
  formats.push(headerFmt(row, 0, 2));

  cells.push({ row, col: 3, value: "■画面　□バッチ処理" });
  merges.push({ startRow: row, endRow: row, startCol: 3, endCol: 9 });
  formats.push(dataFmt(row, 3, { endCol: 9, hAlign: "center" }));

  cells.push({ row, col: 10, value: "" });
  merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
  formats.push(dataFmt(row, 10, { endCol: 45 }));

  row++;

  // ====================================================
  // Row 7-9: 設定内容の入力欄
  // ====================================================
  for (let r = 0; r < 3; r++) {
    const content = r === 0 && data.processOverview ? data.processOverview : "";
    cells.push({ row, col: 0, value: content });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
    formats.push(dataFmt(row, 0, { endCol: 45, wrapText: true, vAlign: "top" }));
    row++;
  }

  // ====================================================
  // Row 10: 本番URL(col0-2) | 値入力欄(col3-45)
  // ====================================================
  cells.push({ row, col: 0, value: "本番URL" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 2 });
  formats.push(headerFmt(row, 0, 2));

  cells.push({ row, col: 3, value: "" });
  merges.push({ startRow: row, endRow: row, startCol: 3, endCol: 45 });
  formats.push(dataFmt(row, 3, { endCol: 45 }));

  row++;

  // ====================================================
  // Row 11: 空行
  // ====================================================
  row++;

  // ====================================================
  // Row 12-21: スケジュールセクション（設計、実装、単体テスト、結合テスト、受入テスト）
  // 各項目: ラベル(col0-2) | 値(col3-9) | 開始(col10-12) | 値(col13-17) | 終了(col18-20) | 値(col21-45)
  // 各項目の後に空行
  // ====================================================
  const scheduleItems = ["設計", "実装", "単体テスト", "結合テスト", "受入テスト"];
  for (const item of scheduleItems) {
    cells.push({ row, col: 0, value: item });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 2 });
    formats.push(headerFmt(row, 0, 2));

    cells.push({ row, col: 3, value: "" });
    merges.push({ startRow: row, endRow: row, startCol: 3, endCol: 9 });
    formats.push(dataFmt(row, 3, { endCol: 9 }));

    cells.push({ row, col: 10, value: "開始" });
    merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 12 });
    formats.push(headerFmt(row, 10, 12));

    cells.push({ row, col: 13, value: "" });
    merges.push({ startRow: row, endRow: row, startCol: 13, endCol: 17 });
    formats.push(dataFmt(row, 13, { endCol: 17 }));

    cells.push({ row, col: 18, value: "終了" });
    merges.push({ startRow: row, endRow: row, startCol: 18, endCol: 20 });
    formats.push(headerFmt(row, 18, 20));

    cells.push({ row, col: 21, value: "" });
    merges.push({ startRow: row, endRow: row, startCol: 21, endCol: 45 });
    formats.push(dataFmt(row, 21, { endCol: 45 }));

    row++;
    // 空行
    row++;
  }

  // ====================================================
  // 区切り線
  // ====================================================
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(separatorFmt(row));
  rowHeights.push({ row, height: 8 });
  row++;

  // ====================================================
  // 入力パラメータセクション
  // ====================================================
  cells.push({ row, col: 0, value: "入力パラメータ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(sectionHeaderFmt(row));
  rowHeights.push({ row, height: 28 });
  row++;

  // ヘッダー行: Ｎｏ(col0-1) | データＩＤ(col2-7) | 項目名(col8-16) | 桁数(col17-18) | 型(col19-21) | 摘要(col22-45)
  cells.push({ row, col: 0, value: "Ｎｏ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(headerFmt(row, 0, 1));

  cells.push({ row, col: 2, value: "データＩＤ" });
  merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 7 });
  formats.push(headerFmt(row, 2, 7));

  cells.push({ row, col: 8, value: "項　　目　　名" });
  merges.push({ startRow: row, endRow: row, startCol: 8, endCol: 16 });
  formats.push(headerFmt(row, 8, 16));

  cells.push({ row, col: 17, value: "桁数" });
  merges.push({ startRow: row, endRow: row, startCol: 17, endCol: 18 });
  formats.push(headerFmt(row, 17, 18));

  cells.push({ row, col: 19, value: "型" });
  merges.push({ startRow: row, endRow: row, startCol: 19, endCol: 21 });
  formats.push(headerFmt(row, 19, 21));

  cells.push({ row, col: 22, value: "摘　　　　　要" });
  merges.push({ startRow: row, endRow: row, startCol: 22, endCol: 45 });
  formats.push(headerFmt(row, 22, 45));

  rowHeights.push({ row, height: 28 });
  row++;

  // データ行（10行分の枠、データがあればデータを、なければ空行）
  const paramRowCount = Math.max(10, data.inputParameters.length);
  for (let i = 0; i < paramRowCount; i++) {
    const param = data.inputParameters[i];

    cells.push({ row, col: 0, value: param ? param.no : i + 1 });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
    formats.push(dataFmt(row, 0, { endCol: 1, hAlign: "center" }));

    cells.push({ row, col: 2, value: param ? param.dataId : "" });
    merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 7 });
    formats.push(dataFmt(row, 2, { endCol: 7 }));

    cells.push({ row, col: 8, value: param ? param.itemName : "" });
    merges.push({ startRow: row, endRow: row, startCol: 8, endCol: 16 });
    formats.push(dataFmt(row, 8, { endCol: 16 }));

    cells.push({ row, col: 17, value: param ? param.digits : "" });
    merges.push({ startRow: row, endRow: row, startCol: 17, endCol: 18 });
    formats.push(dataFmt(row, 17, { endCol: 18, hAlign: "center" }));

    cells.push({ row, col: 19, value: param ? param.type : "" });
    merges.push({ startRow: row, endRow: row, startCol: 19, endCol: 21 });
    formats.push(dataFmt(row, 19, { endCol: 21, hAlign: "center" }));

    cells.push({ row, col: 22, value: param ? param.remarks : "" });
    merges.push({ startRow: row, endRow: row, startCol: 22, endCol: 45 });
    formats.push(dataFmt(row, 22, { endCol: 45, wrapText: true }));

    row++;
  }

  // ====================================================
  // 区切り線
  // ====================================================
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(separatorFmt(row));
  rowHeights.push({ row, height: 8 });
  row++;

  // ====================================================
  // 関連設定セクション
  // ====================================================
  cells.push({ row, col: 0, value: "関連設定" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(sectionHeaderFmt(row));
  rowHeights.push({ row, height: 28 });

  // ヘッダー行: Ｎｏ(col0-1) | 設定項目(col2-9) | 設定場所(col10-45)
  cells.push({ row, col: 0, value: "Ｎｏ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(headerFmt(row, 0, 1));

  cells.push({ row, col: 2, value: "設定項目" });
  merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 9 });
  formats.push(headerFmt(row, 2, 9));

  cells.push({ row, col: 10, value: "設定場所" });
  merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
  formats.push(headerFmt(row, 10, 45));

  row++;

  // データ行（10行分の枠）
  const settingRowCount = Math.max(10, data.relatedSettings.length);
  for (let i = 0; i < settingRowCount; i++) {
    const setting = data.relatedSettings[i];

    cells.push({ row, col: 0, value: i + 1 });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
    formats.push(dataFmt(row, 0, { endCol: 1, hAlign: "center" }));

    cells.push({ row, col: 2, value: setting ? setting.settingItem : "" });
    merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 9 });
    formats.push(dataFmt(row, 2, { endCol: 9 }));

    cells.push({ row, col: 10, value: setting ? setting.settingLocation : "" });
    merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
    formats.push(dataFmt(row, 10, { endCol: 45, wrapText: true }));

    row++;
  }

  // ====================================================
  // 備考セクション
  // ====================================================
  cells.push({ row, col: 0, value: "備考" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(sectionHeaderFmt(row));
  rowHeights.push({ row, height: 28 });
  row++;

  // 備考の空行（3行分）
  for (let r = 0; r < 3; r++) {
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
    formats.push(dataFmt(row, 0, { endCol: 45, wrapText: true }));
    row++;
  }

  // ====================================================
  // 区切り線
  // ====================================================
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(separatorFmt(row));
  rowHeights.push({ row, height: 8 });
  row++;

  // ====================================================
  // 要件用語セクション
  // ====================================================
  cells.push({ row, col: 0, value: "要件用語" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 45 });
  formats.push(sectionHeaderFmt(row));
  rowHeights.push({ row, height: 28 });
  row++;

  // ヘッダー行: Ｎｏ(col0-1) | 用語(col2-9) | 概要(col10-45)
  cells.push({ row, col: 0, value: "Ｎｏ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(headerFmt(row, 0, 1));

  cells.push({ row, col: 2, value: "用語" });
  merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 9 });
  formats.push(headerFmt(row, 2, 9));

  cells.push({ row, col: 10, value: "概要" });
  merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
  formats.push(headerFmt(row, 10, 45));

  rowHeights.push({ row, height: 28 });
  row++;

  // データ行（10行分の枠）
  const termRowCount = Math.max(10, data.terminology.length);
  for (let i = 0; i < termRowCount; i++) {
    const term = data.terminology[i];

    cells.push({ row, col: 0, value: i + 1 });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
    formats.push(dataFmt(row, 0, { endCol: 1, hAlign: "center" }));

    cells.push({ row, col: 2, value: term ? term.term : "" });
    merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 9 });
    formats.push(dataFmt(row, 2, { endCol: 9 }));

    cells.push({ row, col: 10, value: term ? term.definition : "" });
    merges.push({ startRow: row, endRow: row, startCol: 10, endCol: 45 });
    formats.push(dataFmt(row, 10, { endCol: 45, wrapText: true, vAlign: "top" }));

    row++;
  }

  // ====================================================
  // 列幅設定（46列を均等に小さく設定）
  // ====================================================
  const columnWidths: ColumnWidth[] = [];
  for (let c = 0; c < TOTAL_COLS; c++) {
    columnWidths.push({ col: c, width: 30 });
  }

  return {
    sheetName: "要件定義書",
    cells,
    merges,
    formats,
    columnWidths,
    rowHeights,
    frozenRows: 1,
  };
}
