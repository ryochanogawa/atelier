/**
 * Spreadsheet Formatter Service
 * 顧客向け要件定義DTOをスプレッドシートドキュメントに変換する。
 * NTTコミュニケーションズ要件定義書スタイルのレイアウトを生成する。
 */

import type { ClientRequirementsDto, BusinessFlow } from "../dto/client-requirements.dto.js";
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

// ── NTTコミュニケーションズ スタイル定数 ──

/** #99ccff — NTTヘッダー背景（濃い水色） */
const COLOR_HEADER_BG: RgbaColor = { red: 0.6, green: 0.8, blue: 1.0 };
/** #cfe2f3 — セクションヘッダー背景（薄い水色） */
const COLOR_SECTION_BG: RgbaColor = { red: 0.81, green: 0.89, blue: 0.95 };
/** #fce5cd — 強調/サブヘッダー背景（薄いオレンジ） */
const COLOR_ACCENT_BG: RgbaColor = { red: 0.99, green: 0.9, blue: 0.8 };
/** 黒テキスト */
const COLOR_BLACK: RgbaColor = { red: 0, green: 0, blue: 0 };
/** 白背景 */
const COLOR_WHITE: RgbaColor = { red: 1, green: 1, blue: 1 };

/** スイムレーンアクター列の色（NTTスタイル） */
const COLOR_ACTOR_COLORS: RgbaColor[] = [
  { red: 0.99, green: 0.9, blue: 0.8 },   // #fce5cd — 薄いオレンジ
  { red: 0.92, green: 0.82, blue: 0.86 },  // #ead1dc — 薄いピンク
  { red: 0.85, green: 0.92, blue: 0.83 },  // #d9ead3 — 薄い緑
  { red: 0.85, green: 0.82, blue: 0.91 },  // #d9d2e9 — 薄い紫
  { red: 0.96, green: 0.8, blue: 0.8 },    // #f4cccc — 薄い赤
  { red: 0.81, green: 0.89, blue: 0.95 },  // #cfe2f3 — 薄い水色
];

const DEFAULT_COL_WIDTH = 200;
const SWIMLANE_COL_WIDTH = 220;
const NARROW_COL_WIDTH = 80;
const WIDE_COL_WIDTH = 300;
const HEADER_ROW_HEIGHT = 28;
const DEFAULT_ROW_HEIGHT = 24;

// ── ヘルパー: NTTスタイル罫線付きセルフォーマット ──

/** ヘッダーセルフォーマット（#99ccff背景、黒テキスト、中央揃え、実線ボーダー） */
function headerFormat(row: number, col: number, extra?: Partial<CellFormat>): CellFormat {
  return {
    row, col,
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
    ...extra,
  };
}

/** データセルフォーマット（白背景、実線ボーダー） */
function dataFormat(row: number, col: number, extra?: Partial<CellFormat>): CellFormat {
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

/** セクション見出しフォーマット（#99ccff背景、実線ボーダー） */
function sectionHeaderFormat(row: number, col: number, endCol?: number): CellFormat {
  return {
    row, col,
    ...(endCol !== undefined ? { endCol } : {}),
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

// ── メインエントリポイント ──

/**
 * ClientRequirementsDtoからスプレッドシートドキュメントを生成する。
 */
export function formatClientRequirements(
  data: ClientRequirementsDto,
): SpreadsheetDocument {
  const sheets: SheetDefinition[] = [
    buildCoverSheet(data),
    buildRequirementsSheet(data),
    ...buildBusinessFlowSheets(data.businessFlows),
  ];

  if (data.screens.length > 0) {
    sheets.push(buildScreensSheet(data));
  }

  if (data.inputParameters.length > 0 || data.outputParameters.length > 0) {
    sheets.push(buildParametersSheet(data));
  }

  if (data.terminology.length > 0) {
    sheets.push(buildTerminologySheet(data));
  }

  return {
    title: `${data.projectInfo.projectName} - 要件定義書`,
    sheets,
  };
}

// ── 表紙シート（NTTコミュニケーションズ形式） ──

function buildCoverSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  const rowHeights: RowHeight[] = [];
  let row = 0;

  // ──────────────────────────────────────────────
  // Row 0: ヘッダーラベル行
  //   管理ID | プロジェクト名 | サブシステム名 | タイトル | PG | 査閲 | 作業項目
  // ──────────────────────────────────────────────
  const headerLabels = ["管理ID", "プロジェクト名", "サブシステム名", "タイトル", "PG", "査閲", "作業項目"];
  for (let c = 0; c < headerLabels.length; c++) {
    cells.push({ row, col: c, value: headerLabels[c] });
    formats.push(headerFormat(row, c));
  }
  // 作業項目は col 6-7 にマージ
  merges.push({ startRow: row, endRow: row, startCol: 6, endCol: 7 });
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // ──────────────────────────────────────────────
  // Row 1: 値行
  //   (空) | プロジェクト名 | サブシステム名 | タイトル | (空) | (空) | (空)
  // ──────────────────────────────────────────────
  cells.push({ row, col: 1, value: data.projectInfo.projectName });
  cells.push({ row, col: 2, value: "" });
  cells.push({ row, col: 3, value: data.projectInfo.documentTitle || "要件定義書" });
  for (let c = 0; c < 8; c++) {
    formats.push(dataFormat(row, c, {
      hAlign: "center",
      fontSize: c === 3 ? 14 : c === 1 ? 12 : 10,
    }));
  }
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // ──────────────────────────────────────────────
  // Row 2: 作成者行
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "作成者" });
  formats.push(headerFormat(row, 0));
  cells.push({ row, col: 1, value: data.projectInfo.author });
  for (let c = 1; c < 8; c++) {
    formats.push(dataFormat(row, c));
  }
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // ──────────────────────────────────────────────
  // Row 3: 空行
  // ──────────────────────────────────────────────
  // 空行はフォーマットなし（罫線不要）
  row++;

  // ──────────────────────────────────────────────
  // Row 4: セパレータ（大きな空行）
  // ──────────────────────────────────────────────
  rowHeights.push({ row, height: 8 });
  row++;

  // ──────────────────────────────────────────────
  // Row 5: ＩＤ－ＮＯ | タイプ | 実行環境 | バージョン | 版 | 更新日付 | 作成日付 | ページ
  // ──────────────────────────────────────────────
  const idHeaders = ["ＩＤ－ＮＯ", "タイプ", "実行環境", "バージョン", "版", "更新日付", "作成日付", "ﾍﾟｰｼﾞ"];
  for (let c = 0; c < idHeaders.length; c++) {
    cells.push({ row, col: c, value: idHeaders[c] });
    formats.push(headerFormat(row, c));
  }
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // ──────────────────────────────────────────────
  // Row 6: 概要 + 値行
  //   概要 | ■画面　□バッチ処理 | (実行環境) | (空) | 版 | 更新日付 | 作成日付 | ページ
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "概要" });
  formats.push(headerFormat(row, 0));
  cells.push({ row, col: 1, value: "■画面　□バッチ処理" });
  formats.push(dataFormat(row, 1, { hAlign: "center", fontSize: 11 }));
  cells.push({ row, col: 2, value: "" });
  formats.push(dataFormat(row, 2, { hAlign: "center" }));
  cells.push({ row, col: 3, value: "" });
  formats.push(dataFormat(row, 3, { hAlign: "center" }));
  cells.push({ row, col: 4, value: data.projectInfo.version });
  formats.push(dataFormat(row, 4, { hAlign: "center" }));
  cells.push({ row, col: 5, value: data.projectInfo.updatedDate });
  formats.push(dataFormat(row, 5, { hAlign: "center", fontSize: 8 }));
  cells.push({ row, col: 6, value: data.projectInfo.createdDate });
  formats.push(dataFormat(row, 6, { hAlign: "center", fontSize: 8 }));
  cells.push({ row, col: 7, value: "1/1" });
  formats.push(dataFormat(row, 7, { hAlign: "center", fontSize: 8 }));
  row++;

  // ──────────────────────────────────────────────
  // Row 7: 空行
  // ──────────────────────────────────────────────
  row++;

  // ──────────────────────────────────────────────
  // Row 8: 設定内容セクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 3, value: "設定内容" });
  formats.push(dataFormat(row, 3, { hAlign: "center" }));
  for (let c = 0; c < 8; c++) {
    if (c !== 3) formats.push(dataFormat(row, c));
  }
  row++;

  // ──────────────────────────────────────────────
  // Row 9: 空行
  // ──────────────────────────────────────────────
  row++;

  // ──────────────────────────────────────────────
  // Row 10: 本番URL（もしprocessOverviewがあれば代わりに表示）
  // ──────────────────────────────────────────────
  if (data.processOverview) {
    cells.push({ row, col: 0, value: "概要" });
    formats.push(headerFormat(row, 0));
    cells.push({ row, col: 1, value: data.processOverview });
    merges.push({ startRow: row, endRow: row, startCol: 1, endCol: 7 });
    formats.push(dataFormat(row, 1, { endCol: 7, wrapText: true, vAlign: "top" }));
    row++;
  }

  // ──────────────────────────────────────────────
  // 空行
  // ──────────────────────────────────────────────
  row++;

  // ──────────────────────────────────────────────
  // スケジュールセクション（設計・実装・テスト）
  // ──────────────────────────────────────────────
  const scheduleItems = ["設計", "実装", "単体テスト", "結合テスト", "受入テスト"];
  for (const item of scheduleItems) {
    const reviewLabel = item === "設計" || item === "実装" ? "レビュー" : "備考";
    cells.push({ row, col: 0, value: item });
    formats.push(headerFormat(row, 0));
    cells.push({ row, col: 2, value: "開始" });
    formats.push(headerFormat(row, 2));
    cells.push({ row, col: 4, value: "終了" });
    formats.push(headerFormat(row, 4));
    cells.push({ row, col: 6, value: reviewLabel });
    formats.push(headerFormat(row, 6));
    // Value cells
    for (const c of [1, 3, 5, 7]) {
      formats.push(dataFormat(row, c));
    }
    row++;
    // 空行
    row++;
  }

  // ──────────────────────────────────────────────
  // セパレータ（大きな空行）
  // ──────────────────────────────────────────────
  rowHeights.push({ row, height: 8 });
  row++;

  // ──────────────────────────────────────────────
  // 入力パラメータセクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "入力パラメータ" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(sectionHeaderFormat(row, 0, 1));
  row++;

  const paramHeaders = ["Ｎｏ", "データＩＤ", "項　　目　　名", "桁数", "型", "摘　　　　　要"];
  for (let c = 0; c < paramHeaders.length; c++) {
    cells.push({ row, col: c, value: paramHeaders[c] });
    formats.push(headerFormat(row, c));
  }
  // 摘要は col 5-7 にマージ
  merges.push({ startRow: row, endRow: row, startCol: 5, endCol: 7 });
  row++;

  if (data.inputParameters.length > 0) {
    for (const param of data.inputParameters) {
      cells.push({ row, col: 0, value: param.no });
      cells.push({ row, col: 1, value: param.dataId });
      cells.push({ row, col: 2, value: param.itemName });
      cells.push({ row, col: 3, value: param.digits });
      cells.push({ row, col: 4, value: param.type });
      cells.push({ row, col: 5, value: param.remarks });
      merges.push({ startRow: row, endRow: row, startCol: 5, endCol: 7 });
      for (let c = 0; c < 6; c++) {
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  } else {
    // 空の10行を確保（NTT形式）
    for (let i = 1; i <= 10; i++) {
      cells.push({ row, col: 0, value: i });
      merges.push({ startRow: row, endRow: row, startCol: 5, endCol: 7 });
      for (let c = 0; c < 6; c++) {
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  }

  // ──────────────────────────────────────────────
  // 関連設定セクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "関連設定" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(sectionHeaderFormat(row, 0, 1));
  row++;

  const settingHeaders = ["Ｎｏ", "設定項目", "設定場所"];
  for (let c = 0; c < settingHeaders.length; c++) {
    cells.push({ row, col: c, value: settingHeaders[c] });
    formats.push(headerFormat(row, c));
  }
  // 設定場所は col 2-3 にマージ
  merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
  row++;

  if (data.relatedSettings.length > 0) {
    for (let i = 0; i < data.relatedSettings.length; i++) {
      const setting = data.relatedSettings[i];
      cells.push({ row, col: 0, value: i + 1 });
      cells.push({ row, col: 1, value: setting.settingItem });
      cells.push({ row, col: 2, value: setting.settingLocation });
      merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
      for (let c = 0; c < 4; c++) {
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  } else {
    for (let i = 1; i <= 10; i++) {
      cells.push({ row, col: 0, value: i });
      merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
      for (let c = 0; c < 4; c++) {
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  }

  // ──────────────────────────────────────────────
  // 備考セクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "備考" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(sectionHeaderFormat(row, 0, 1));
  row++;
  // 備考の空行
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 7 });
  formats.push(dataFormat(row, 0, { endCol: 7, wrapText: true }));
  row++;
  row++;

  // ──────────────────────────────────────────────
  // セパレータ（大きな空行）
  // ──────────────────────────────────────────────
  rowHeights.push({ row, height: 8 });
  row++;

  // ──────────────────────────────────────────────
  // 要件用語セクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "要件用語" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
  formats.push(sectionHeaderFormat(row, 0, 1));
  row++;

  const termHeaders = ["Ｎｏ", "用語", "概要"];
  for (let c = 0; c < termHeaders.length; c++) {
    cells.push({ row, col: c, value: termHeaders[c] });
    formats.push(headerFormat(row, c));
  }
  // 概要は col 2-3 にマージ
  merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
  row++;

  if (data.terminology.length > 0) {
    for (let i = 0; i < data.terminology.length; i++) {
      const term = data.terminology[i];
      cells.push({ row, col: 0, value: i + 1 });
      cells.push({ row, col: 1, value: term.term });
      cells.push({ row, col: 2, value: term.definition });
      merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
      for (let c = 0; c < 4; c++) {
        formats.push(dataFormat(row, c, { wrapText: true, vAlign: "top" }));
      }
      row++;
    }
  } else {
    for (let i = 1; i <= 10; i++) {
      cells.push({ row, col: 0, value: i });
      merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 3 });
      for (let c = 0; c < 4; c++) {
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  }

  // ──────────────────────────────────────────────
  // セパレータ
  // ──────────────────────────────────────────────
  rowHeights.push({ row, height: 8 });
  row++;

  // ──────────────────────────────────────────────
  // 処理概要セクション
  // ──────────────────────────────────────────────
  cells.push({ row, col: 0, value: "処理概要" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 7 });
  formats.push(sectionHeaderFormat(row, 0, 7));
  row++;

  // 概要ラベル行
  cells.push({ row, col: 0, value: "概要" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 7 });
  formats.push({
    row, col: 0, endCol: 7,
    bold: false, fontSize: 17,
    bgColor: COLOR_WHITE, textColor: COLOR_BLACK,
    vAlign: "middle",
  });
  row++;

  // 概要本文
  if (data.processOverview) {
    cells.push({ row, col: 0, value: data.processOverview });
    merges.push({ startRow: row, endRow: row + 2, startCol: 0, endCol: 7 });
    formats.push({
      row, col: 0, endRow: row + 2, endCol: 7,
      fontSize: 10, wrapText: true, vAlign: "top",
      bgColor: COLOR_WHITE, textColor: COLOR_BLACK,
    });
    row += 3;
  }
  row++;

  return {
    sheetName: "表紙",
    cells,
    merges,
    formats,
    columnWidths: [
      { col: 0, width: 100 },
      { col: 1, width: 140 },
      { col: 2, width: 140 },
      { col: 3, width: 180 },
      { col: 4, width: 60 },
      { col: 5, width: 100 },
      { col: 6, width: 100 },
      { col: 7, width: 100 },
    ],
    rowHeights,
    frozenRows: 1,
  };
}

// ── 要件一覧シート ──

function buildRequirementsSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  // ヘッダー行（#99ccff背景）
  const headers = ["No", "要件ID", "カテゴリ", "要件名", "説明", "優先度", "受け入れ基準"];
  for (let c = 0; c < headers.length; c++) {
    cells.push({ row, col: c, value: headers[c] });
    formats.push(headerFormat(row, c));
  }
  row++;

  // データ行
  for (let i = 0; i < data.requirements.length; i++) {
    const req = data.requirements[i];
    const values = [
      i + 1,
      req.id,
      req.category,
      req.name,
      req.description,
      req.priority,
      req.acceptanceCriteria,
    ];
    for (let c = 0; c < values.length; c++) {
      cells.push({ row, col: c, value: values[c] });
      formats.push(dataFormat(row, c, { wrapText: true, vAlign: "top" }));
    }
    row++;
  }

  return {
    sheetName: "要件一覧",
    cells,
    merges,
    formats,
    columnWidths: [
      { col: 0, width: 50 },
      { col: 1, width: NARROW_COL_WIDTH },
      { col: 2, width: 120 },
      { col: 3, width: DEFAULT_COL_WIDTH },
      { col: 4, width: WIDE_COL_WIDTH },
      { col: 5, width: NARROW_COL_WIDTH },
      { col: 6, width: WIDE_COL_WIDTH },
    ],
    rowHeights: [{ row: 0, height: HEADER_ROW_HEIGHT }],
    frozenRows: 1,
  };
}

// ── 業務フローシート（スイムレーン形式・NTTスタイル） ──

function buildBusinessFlowSheets(flows: readonly BusinessFlow[]): SheetDefinition[] {
  return flows.map((flow, index) =>
    buildSwimlaneSheet(flow, index + 1),
  );
}

function buildSwimlaneSheet(flow: BusinessFlow, flowIndex: number): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  const rowHeights: RowHeight[] = [];
  let row = 0;

  const actors = flow.actors;
  const actorCount = actors.length;
  const totalCols = actorCount + 1; // ステップNo列 + アクター列

  // ──────────────────────────────────────────────
  // フロータイトル行（白背景、17pt、太字 — NTTの s23 スタイル）
  // ──────────────────────────────────────────────
  const flowTitle = `○${flow.flowName}`;
  cells.push({ row, col: 0, value: flowTitle });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: totalCols - 1 });
  formats.push({
    row, col: 0, endCol: totalCols - 1,
    bold: true, fontSize: 17,
    bgColor: COLOR_WHITE, textColor: COLOR_BLACK,
    vAlign: "middle",
    borderBottom: "thin",
  });
  rowHeights.push({ row, height: 36 });
  row++;

  // ──────────────────────────────────────────────
  // スイムレーンヘッダー: アクター列（各アクター固有色）
  // ──────────────────────────────────────────────
  // 最初の列は空（ステップNo用）
  cells.push({ row, col: 0, value: "" });
  formats.push(dataFormat(row, 0, { hAlign: "center" }));

  for (let a = 0; a < actorCount; a++) {
    cells.push({ row, col: a + 1, value: actors[a] });
    const actorColor = COLOR_ACTOR_COLORS[a % COLOR_ACTOR_COLORS.length];
    formats.push({
      row, col: a + 1,
      bold: false, fontSize: 10,
      bgColor: actorColor,
      textColor: COLOR_BLACK,
      hAlign: "center", vAlign: "middle",
      borderTop: "thin", borderBottom: "thin",
      borderLeft: "thin", borderRight: "thin",
    });
  }
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // ──────────────────────────────────────────────
  // フロー説明行（もしあれば）
  // ──────────────────────────────────────────────
  if (flow.description) {
    cells.push({ row, col: 0, value: flow.description });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: totalCols - 1 });
    formats.push({
      row, col: 0, endCol: totalCols - 1,
      wrapText: true, fontSize: 10,
      bgColor: COLOR_WHITE, textColor: COLOR_BLACK,
      vAlign: "middle",
    });
    row++;
  }

  // ──────────────────────────────────────────────
  // 空行
  // ──────────────────────────────────────────────
  row++;

  // ──────────────────────────────────────────────
  // フローステップ行（NTTスタイル: 破線ボーダーで区切り）
  // ──────────────────────────────────────────────
  for (const step of flow.steps) {
    const actorIndex = actors.indexOf(step.actor);
    const targetCol = actorIndex >= 0 ? actorIndex + 1 : 1;

    // ステップ番号はセクションヘッダー（#cfe2f3）で表示
    const stepLabel = `ステップ${step.stepNumber}:${step.action}`;
    cells.push({ row, col: targetCol, value: stepLabel });
    formats.push({
      row, col: targetCol,
      bold: false, fontSize: 10,
      bgColor: COLOR_SECTION_BG,
      textColor: COLOR_BLACK,
      hAlign: "center", vAlign: "middle",
      borderTop: "thin", borderBottom: "thin",
      borderLeft: "thin", borderRight: "thin",
    });

    // 他のアクター列は空、破線ボーダー
    for (let a = 0; a < actorCount; a++) {
      const col = a + 1;
      if (col !== targetCol) {
        formats.push({
          row, col,
          bgColor: COLOR_WHITE,
          borderTop: "thin", borderBottom: "thin",
          borderLeft: "thin", borderRight: "thin",
        });
      }
    }
    // ステップNo列
    formats.push(dataFormat(row, 0, { hAlign: "center" }));
    row++;

    // 詳細行（もしあれば）
    if (step.details) {
      cells.push({ row, col: targetCol, value: step.details });
      for (let c = 0; c <= actorCount; c++) {
        formats.push(dataFormat(row, c, {
          wrapText: c === targetCol,
          vAlign: "middle",
        }));
      }
      row++;
    }

    // 分岐条件がある場合
    if (step.branchCondition) {
      let branchContent = `【判断】${step.branchCondition}`;
      if (step.branchYes) branchContent += `\n → Yes: ステップ${step.branchYes}`;
      if (step.branchNo) branchContent += `\n → No: ステップ${step.branchNo}`;

      cells.push({ row, col: targetCol, value: branchContent });
      for (let c = 0; c <= actorCount; c++) {
        formats.push(dataFormat(row, c, {
          wrapText: c === targetCol,
          vAlign: "middle",
          bgColor: c === targetCol ? COLOR_ACCENT_BG : COLOR_WHITE,
        }));
      }
      rowHeights.push({ row, height: 60 });
      row++;
    }

    // ステップ間の空行
    row++;
  }

  // 列幅
  const columnWidths: ColumnWidth[] = [
    { col: 0, width: 30 },
    ...actors.map((_, a) => ({ col: a + 1, width: SWIMLANE_COL_WIDTH })),
  ];

  return {
    sheetName: `フロー${flowIndex}_${flow.flowName}`.slice(0, 31),
    cells,
    merges,
    formats,
    columnWidths,
    rowHeights,
    frozenRows: 2,
  };
}

// ── 画面一覧シート ──

function buildScreensSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  const headers = ["No", "画面ID", "画面名", "目的・概要", "主な項目", "関連フロー", "遷移先"];
  for (let c = 0; c < headers.length; c++) {
    cells.push({ row, col: c, value: headers[c] });
    formats.push(headerFormat(row, c));
  }
  row++;

  for (let i = 0; i < data.screens.length; i++) {
    const scr = data.screens[i];
    const values = [
      i + 1,
      scr.screenId,
      scr.screenName,
      scr.description,
      scr.mainItems.join("\n"),
      scr.relatedFlows.join("\n"),
      scr.transitions.join("\n"),
    ];
    for (let c = 0; c < values.length; c++) {
      cells.push({ row, col: c, value: values[c] });
      formats.push(dataFormat(row, c, { wrapText: true, vAlign: "top" }));
    }
    row++;
  }

  return {
    sheetName: "画面一覧",
    cells,
    merges: [],
    formats,
    columnWidths: [
      { col: 0, width: 50 },
      { col: 1, width: NARROW_COL_WIDTH },
      { col: 2, width: 150 },
      { col: 3, width: WIDE_COL_WIDTH },
      { col: 4, width: DEFAULT_COL_WIDTH },
      { col: 5, width: 150 },
      { col: 6, width: 150 },
    ],
    rowHeights: [{ row: 0, height: HEADER_ROW_HEIGHT }],
    frozenRows: 1,
  };
}

// ── パラメータシート ──

function buildParametersSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  const headers = ["Ｎｏ", "データＩＤ", "項　　目　　名", "桁数", "型", "摘　　　　　要"];

  // 入力パラメータ
  if (data.inputParameters.length > 0) {
    cells.push({ row, col: 0, value: "入力パラメータ" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
    formats.push(sectionHeaderFormat(row, 0, 1));
    row++;

    for (let c = 0; c < headers.length; c++) {
      cells.push({ row, col: c, value: headers[c] });
      formats.push(headerFormat(row, c));
    }
    row++;

    for (const param of data.inputParameters) {
      const values = [param.no, param.dataId, param.itemName, param.digits, param.type, param.remarks];
      for (let c = 0; c < values.length; c++) {
        cells.push({ row, col: c, value: values[c] });
        formats.push(dataFormat(row, c));
      }
      row++;
    }
    row++;
  }

  // 出力パラメータ
  if (data.outputParameters.length > 0) {
    cells.push({ row, col: 0, value: "出力パラメータ" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 1 });
    formats.push(sectionHeaderFormat(row, 0, 1));
    row++;

    for (let c = 0; c < headers.length; c++) {
      cells.push({ row, col: c, value: headers[c] });
      formats.push(headerFormat(row, c));
    }
    row++;

    for (const param of data.outputParameters) {
      const values = [param.no, param.dataId, param.itemName, param.digits, param.type, param.remarks];
      for (let c = 0; c < values.length; c++) {
        cells.push({ row, col: c, value: values[c] });
        formats.push(dataFormat(row, c));
      }
      row++;
    }
  }

  return {
    sheetName: "パラメータ",
    cells,
    merges,
    formats,
    columnWidths: [
      { col: 0, width: 50 },
      { col: 1, width: 120 },
      { col: 2, width: DEFAULT_COL_WIDTH },
      { col: 3, width: NARROW_COL_WIDTH },
      { col: 4, width: 100 },
      { col: 5, width: WIDE_COL_WIDTH },
    ],
    rowHeights: [],
    frozenRows: 0,
  };
}

// ── 用語集シート ──

function buildTerminologySheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  const headers = ["Ｎｏ", "用語", "概要", "関連ドメイン"];
  for (let c = 0; c < headers.length; c++) {
    cells.push({ row, col: c, value: headers[c] });
    formats.push(headerFormat(row, c));
  }
  row++;

  for (let i = 0; i < data.terminology.length; i++) {
    const term = data.terminology[i];
    const values = [i + 1, term.term, term.definition, term.relatedDomain];
    for (let c = 0; c < values.length; c++) {
      cells.push({ row, col: c, value: values[c] });
      formats.push(dataFormat(row, c, { wrapText: true, vAlign: "top" }));
    }
    row++;
  }

  return {
    sheetName: "用語集",
    cells,
    merges: [],
    formats,
    columnWidths: [
      { col: 0, width: 50 },
      { col: 1, width: 160 },
      { col: 2, width: WIDE_COL_WIDTH },
      { col: 3, width: 150 },
    ],
    rowHeights: [{ row: 0, height: HEADER_ROW_HEIGHT }],
    frozenRows: 1,
  };
}
