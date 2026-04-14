/**
 * Spreadsheet Formatter Service
 * 顧客向け要件定義DTOをスプレッドシートドキュメントに変換する。
 * テンプレート（ID: 1G2l6G_m9C8U_uvcU-czB21FE0hlcRUfG2cT3zrjXkEo）の
 * レイアウトに準拠。1画面=1シート。
 * 全45列（col0-44）、全て25px幅、グリッド線非表示。
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

// ── 定数 ──

/** 使用する列数: col0-44 の45列 */
const TOTAL_COLS = 45;
/** 最終列インデックス */
const LAST_COL = 44;

/** 標準ヘッダー背景色（水色） */
const COLOR_HEADER: RgbaColor = { red: 0.6, green: 0.8, blue: 1.0 };
/** 処理概要内テーブルヘッダー背景色（緑系） */
const COLOR_GREEN: RgbaColor = { red: 0.6, green: 0.8, blue: 0.6 };
const COLOR_BLACK: RgbaColor = { red: 0, green: 0, blue: 0 };
const COLOR_WHITE: RgbaColor = { red: 1, green: 1, blue: 1 };

// ── ScreenItem 型抽出 ──

type ScreenItem = ClientRequirementsDto["screens"][number];
type CrudOperation = NonNullable<ScreenItem["crudOperations"]>[number];

// ── ビルダークラス ──

/**
 * シート構築用のミュータブルコンテキスト。
 * row カーソルを進めながら cells / merges / formats / rowHeights を蓄積する。
 */
class SheetBuilder {
  cells: CellValue[] = [];
  merges: MergeRange[] = [];
  formats: CellFormat[] = [];
  rowHeights: RowHeight[] = [];
  row = 0;

  // ── 低レベル ──

  /** セル値を追加 */
  cell(col: number, value: string | number): void {
    this.cells.push({ row: this.row, col, value });
  }

  /** 結合を追加 */
  merge(startCol: number, endCol: number, startRow?: number, endRow?: number): void {
    this.merges.push({
      startRow: startRow ?? this.row,
      endRow: endRow ?? this.row,
      startCol,
      endCol,
    });
  }

  /** フォーマットを追加 */
  fmt(col: number, endCol: number, extra?: Partial<CellFormat>): void {
    this.formats.push({
      row: this.row,
      col,
      endCol,
      fontSize: 10,
      textColor: COLOR_BLACK,
      vAlign: "middle",
      ...extra,
    });
  }

  /** 行高さを設定 */
  height(h: number, r?: number): void {
    this.rowHeights.push({ row: r ?? this.row, height: h });
  }

  // ── 高レベル ──

  /** ヘッダーラベルセル（水色背景、中央揃え、罫線thin） */
  headerCell(
    col: number,
    endCol: number,
    value: string,
    opts?: { endRow?: number; bg?: RgbaColor },
  ): void {
    this.cell(col, value);
    this.merge(col, endCol, undefined, opts?.endRow);
    this.fmt(col, endCol, {
      ...(opts?.endRow !== undefined ? { endRow: opts.endRow } : {}),
      bold: false,
      bgColor: opts?.bg ?? COLOR_HEADER,
      hAlign: "center",
      borderTop: "thin",
      borderBottom: "thin",
      borderLeft: "thin",
      borderRight: "thin",
    });
  }

  /** データセル（白背景、罫線thin） */
  dataCell(
    col: number,
    endCol: number,
    value: string | number,
    extra?: Partial<CellFormat>,
  ): void {
    this.cell(col, value);
    this.merge(col, endCol);
    this.fmt(col, endCol, {
      bgColor: COLOR_WHITE,
      borderTop: "thin",
      borderBottom: "thin",
      borderLeft: "thin",
      borderRight: "thin",
      ...extra,
    });
  }

  /** 2行結合のヘッダーラベル */
  headerCell2(
    col: number,
    endCol: number,
    value: string,
    opts?: { bg?: RgbaColor },
  ): void {
    this.headerCell(col, endCol, value, { endRow: this.row + 1, bg: opts?.bg });
  }

  /** 2行結合のデータセル */
  dataCell2(
    col: number,
    endCol: number,
    value: string | number,
    extra?: Partial<CellFormat>,
  ): void {
    this.cell(col, value);
    this.merge(col, endCol, this.row, this.row + 1);
    this.fmt(col, endCol, {
      endRow: this.row + 1,
      bgColor: COLOR_WHITE,
      borderTop: "thin",
      borderBottom: "thin",
      borderLeft: "thin",
      borderRight: "thin",
      ...extra,
    });
  }

  /** N行結合のヘッダーラベル */
  headerCellN(
    col: number,
    endCol: number,
    value: string,
    rows: number,
    opts?: { bg?: RgbaColor },
  ): void {
    this.headerCell(col, endCol, value, {
      endRow: this.row + rows - 1,
      bg: opts?.bg,
    });
  }

  /** N行結合のデータセル */
  dataCellN(
    col: number,
    endCol: number,
    value: string | number,
    rows: number,
    extra?: Partial<CellFormat>,
  ): void {
    this.cell(col, value);
    this.merge(col, endCol, this.row, this.row + rows - 1);
    this.fmt(col, endCol, {
      endRow: this.row + rows - 1,
      bgColor: COLOR_WHITE,
      borderTop: "thin",
      borderBottom: "thin",
      borderLeft: "thin",
      borderRight: "thin",
      ...extra,
    });
  }

  /** 全幅セクションヘッダー行（水色背景）。row++ する */
  sectionHeader(value: string, bg?: RgbaColor): void {
    this.headerCell(0, LAST_COL, value, { bg });
    this.height(28);
    this.row++;
  }

  /** 区切り線（2行結合、全幅、高さ8px）。row += 2 する */
  separator(): void {
    this.merge(0, LAST_COL, this.row, this.row + 1);
    this.fmt(0, LAST_COL, {
      endRow: this.row + 1,
      bgColor: COLOR_WHITE,
      borderTop: "thin",
      borderBottom: "thin",
    });
    this.height(8);
    this.height(8, this.row + 1);
    this.row += 2;
  }

  /** 罫線なし自由テキスト行（全幅結合）。row++ する */
  freeTextRow(value: string, opts?: { bold?: boolean; fontSize?: number }): void {
    this.cell(0, value);
    this.merge(0, LAST_COL);
    this.fmt(0, LAST_COL, {
      bgColor: COLOR_WHITE,
      wrapText: true,
      vAlign: "top",
      bold: opts?.bold,
      fontSize: opts?.fontSize,
    });
    this.row++;
  }

  /** 空行（カーソルだけ進める） */
  skip(n = 1): void {
    this.row += n;
  }
}

// ── メインエントリポイント ──

export function formatClientRequirements(
  data: ClientRequirementsDto,
): SpreadsheetDocument {
  const sheets: SheetDefinition[] = [];

  if (data.screens.length > 0) {
    // 1画面=1シート
    for (const screen of data.screens) {
      sheets.push(buildScreenSheet(data, screen));
    }
  } else {
    // screensが空の場合は1シート
    sheets.push(buildFallbackSheet(data));
  }

  return {
    title: `${data.projectInfo.projectName} - 要件定義書`,
    sheets,
  };
}

// ── 列幅の共通生成 ──

function makeColumnWidths(): ColumnWidth[] {
  const widths: ColumnWidth[] = [];
  for (let c = 0; c < TOTAL_COLS; c++) {
    widths.push({ col: c, width: 25 });
  }
  return widths;
}

// ── シート名のトリミング ──

function trimSheetName(name: string): string {
  return name.length > 30 ? name.slice(0, 30) : name;
}

// ── 画面シート構築 ──

function buildScreenSheet(
  data: ClientRequirementsDto,
  screen: ScreenItem,
): SheetDefinition {
  const b = new SheetBuilder();

  // 固定ヘッダー部（画面固有の情報を使用）
  buildHeader(b, data, screen);      // row 0-3
  b.row = 4; b.skip();               // row 4: 空行 → row=5
  buildIdNoSection(b, data, screen); // row 5-7 → row=8
  b.separator();                     // row 8-9 → row=10
  buildOverview(b, data, screen);    // row 10-11 → row=12
  buildProdUrl(b);                   // row 12-13 → row=14
  buildSchedule(b);                  // row 14-21 → row=22
  b.skip();                          // row 22: 空行 → row=23
  buildSeparatorRow(b);              // row 23: 区切り線(1行) → row=24
  buildInputParams(b, data, screen); // row 24-35 → row=36
  buildSeparatorRow(b);              // row 36: 区切り線 → row=37
  buildRelatedSettings(b, data);     // row 37-48 → row=49
  buildRemarks(b);                   // row 49-51 → row=52
  b.skip();                          // row 52: 空行 → row=53
  buildSeparatorRow(b);              // row 53: 区切り線 → row=54
  buildTerminology(b, data);         // row 54-69 → row=70
  buildSeparatorRow(b);              // row 70: 区切り線 → row=71

  // 処理概要セクション（動的）
  buildProcessContent(b, data, screen);

  // 処理概要の後
  buildSeparatorRow(b);              // 区切り線
  buildOutputParams(b, data, screen); // 出力パラメータ
  buildSeparatorRow(b);              // 区切り線
  buildUpdateHistory(b);             // 更新履歴

  return {
    sheetName: trimSheetName(screen.screenName),
    cells: b.cells,
    merges: b.merges,
    formats: b.formats,
    columnWidths: makeColumnWidths(),
    rowHeights: b.rowHeights,
    frozenRows: 0,
    hideGridlines: true,
  };
}

// ── screensが空の場合のフォールバックシート ──

function buildFallbackSheet(data: ClientRequirementsDto): SheetDefinition {
  const b = new SheetBuilder();

  buildHeader(b, data);
  b.row = 4; b.skip();
  buildIdNoSection(b, data);
  b.separator();
  buildOverviewFallback(b, data);
  buildProdUrl(b);
  buildSchedule(b);
  b.skip();
  buildSeparatorRow(b);
  buildInputParams(b, data);
  buildSeparatorRow(b);
  buildRelatedSettings(b, data);
  buildRemarks(b);
  b.skip();
  buildSeparatorRow(b);
  buildTerminology(b, data);
  buildSeparatorRow(b);

  // 処理概要（フォールバック）
  buildProcessContentFallback(b, data);

  buildSeparatorRow(b);
  buildOutputParams(b, data);
  buildSeparatorRow(b);
  buildUpdateHistory(b);

  return {
    sheetName: "要件定義書",
    cells: b.cells,
    merges: b.merges,
    formats: b.formats,
    columnWidths: makeColumnWidths(),
    rowHeights: b.rowHeights,
    frozenRows: 0,
    hideGridlines: true,
  };
}

// ── 1行区切り線（全幅結合、高さ8px、上下thin） ──

function buildSeparatorRow(b: SheetBuilder): void {
  b.merge(0, LAST_COL);
  b.fmt(0, LAST_COL, {
    bgColor: COLOR_WHITE,
    borderTop: "thin",
    borderBottom: "thin",
  });
  b.height(8);
  b.row++;
}

// ── セクション構築関数 ──

/**
 * ヘッダー部 row 0-3
 */
function buildHeader(b: SheetBuilder, data: ClientRequirementsDto, screen?: ScreenItem): void {
  // ── row 0 ──
  b.row = 0;
  b.headerCell(0, 3, "管理ID");
  b.headerCell(4, 11, "プロジェクト名");
  b.headerCell(12, 17, "サブシステム名");
  b.headerCell(18, 28, "タイトル");
  b.headerCell(29, 30, "PG");
  b.headerCell(31, 32, "査閲");
  // 作業項目: col33-34, 2行結合(row0-1)
  b.headerCell2(33, 34, "作業項目");
  // 空: col35-44, 2行結合(row0-1)
  b.dataCell2(35, LAST_COL, "");
  b.height(21);
  b.row++;

  // ── row 1-3: データ値行 ──
  const screenId = screen?.screenId ?? "";
  const title = screen ? screen.screenName : (data.projectInfo.documentTitle || "要件定義書");
  b.dataCellN(0, 3, screenId, 3, { hAlign: "center" });
  b.dataCellN(4, 11, data.projectInfo.projectName, 3, { hAlign: "center" });
  b.dataCellN(12, 17, "", 3);
  b.dataCellN(18, 28, title, 3, {
    hAlign: "center",
    fontSize: 12,
  });
  b.dataCellN(29, 30, "", 3);
  b.dataCellN(31, 32, "", 3);
  b.height(21);
  b.row++;

  // ── row 2: 作成者ラベル(col33-34, row2-3結合) + 値(col35-44, row2-3結合) ──
  b.headerCell(33, 34, "作成者", { endRow: b.row + 1 });
  b.dataCellN(35, LAST_COL, data.projectInfo.author, 2);
  b.height(21);
  b.row++;

  // ── row 3 ──
  b.height(21);
  b.row++;
}

/**
 * ＩＤ－ＮＯ部 row 5-7
 */
function buildIdNoSection(b: SheetBuilder, data: ClientRequirementsDto, screen?: ScreenItem): void {
  // row 5: ヘッダーラベル
  b.headerCell(0, 2, "ＩＤ－ＮＯ");
  b.headerCell(3, 9, "タイプ");
  b.headerCell(10, 25, "実行環境");
  b.headerCell(26, 29, "バージョン");
  b.headerCell(30, 31, "版");
  b.headerCell(32, 34, "更新日付");
  b.headerCell(35, 41, "作成日付");
  b.headerCell(42, LAST_COL, "ﾍﾟｰｼﾞ");
  b.height(21);
  b.row++;

  // row 6-7: データ値（2行結合）
  b.headerCell2(0, 2, "概要");
  b.dataCell2(3, 9, "■画面　□バッチ処理", { hAlign: "center" });
  b.dataCell2(10, 25, "");
  b.dataCell2(26, 29, data.projectInfo.version);
  b.dataCell2(30, 31, "1");
  b.dataCell2(32, 34, data.projectInfo.updatedDate);
  b.dataCell2(35, 41, data.projectInfo.createdDate);
  b.dataCell2(42, LAST_COL, "1");
  b.height(21);
  b.height(21, b.row + 1);
  b.row += 2;
}

/**
 * 概要 row 10-11（画面あり版: screen.descriptionも使用）
 */
function buildOverview(
  b: SheetBuilder,
  data: ClientRequirementsDto,
  screen: ScreenItem,
): void {
  b.headerCell2(0, 2, "概要");
  const text = screen.description || data.processOverview || "";
  b.dataCell2(3, LAST_COL, text, { wrapText: true, vAlign: "top" });
  b.height(21);
  b.height(21, b.row + 1);
  b.row += 2;
}

/**
 * 概要（フォールバック版）
 */
function buildOverviewFallback(b: SheetBuilder, data: ClientRequirementsDto): void {
  b.headerCell2(0, 2, "概要");
  b.dataCell2(3, LAST_COL, data.processOverview || "", {
    wrapText: true,
    vAlign: "top",
  });
  b.height(21);
  b.height(21, b.row + 1);
  b.row += 2;
}

/**
 * 本番URL row 12-13（2行結合）
 */
function buildProdUrl(b: SheetBuilder): void {
  b.headerCell2(0, 2, "本番URL");
  b.dataCell2(3, LAST_COL, "");
  b.height(21);
  b.height(21, b.row + 1);
  b.row += 2;
}

/**
 * スケジュール row 14-21（4項目x2行結合）
 */
function buildSchedule(b: SheetBuilder): void {
  const items: Array<{ label: string; lastLabel: string }> = [
    { label: "設計", lastLabel: "レビュー" },
    { label: "実装", lastLabel: "レビュー" },
    { label: "単体テスト", lastLabel: "備考" },
    { label: "結合テスト", lastLabel: "備考" },
  ];
  for (const item of items) {
    b.headerCell2(0, 2, item.label);
    b.dataCell2(3, 9, "");
    b.headerCell2(10, 12, "開始");
    b.dataCell2(13, 17, "");
    b.headerCell2(18, 20, "終了");
    b.dataCell2(21, 25, "");
    b.headerCell2(26, 28, item.lastLabel);
    b.dataCell2(29, LAST_COL, "");
    b.height(21);
    b.height(21, b.row + 1);
    b.row += 2;
  }
}

/**
 * 入力パラメータ (セクションヘッダー + テーブルヘッダー + データ行10行)
 */
function buildInputParams(b: SheetBuilder, data: ClientRequirementsDto, screen?: ScreenItem): void {
  b.sectionHeader("入力パラメータ");
  buildParamHeader(b);
  const params = screen?.inputParameters ?? data.inputParameters;
  const count = Math.max(10, params.length);
  for (let i = 0; i < count; i++) {
    const p = params[i];
    buildParamRow(b, i + 1, p);
  }
}

/** パラメータテーブルヘッダー */
function buildParamHeader(b: SheetBuilder): void {
  b.headerCell(0, 1, "Ｎｏ");
  b.headerCell(2, 7, "データＩＤ");
  b.headerCell(8, 16, "項　　目　　名");
  b.headerCell(17, 18, "桁数");
  b.headerCell(19, 21, "型");
  b.headerCell(22, LAST_COL, "摘　　　　　要");
  b.height(21);
  b.row++;
}

/** パラメータデータ行 */
function buildParamRow(
  b: SheetBuilder,
  no: number,
  p?: { no: number; dataId: string; itemName: string; digits: string; type: string; remarks: string },
): void {
  b.dataCell(0, 1, p ? p.no : no, { hAlign: "center" });
  b.dataCell(2, 7, p ? p.dataId : "");
  b.dataCell(8, 16, p ? p.itemName : "");
  b.dataCell(17, 18, p ? p.digits : "", { hAlign: "center" });
  b.dataCell(19, 21, p ? p.type : "", { hAlign: "center" });
  b.dataCell(22, LAST_COL, p ? p.remarks : "", { wrapText: true });
  b.row++;
}

/**
 * 関連設定 (セクションヘッダー + テーブルヘッダー + データ行10行)
 */
function buildRelatedSettings(b: SheetBuilder, data: ClientRequirementsDto): void {
  b.sectionHeader("関連設定");
  b.headerCell(0, 1, "Ｎｏ");
  b.headerCell(2, 9, "設定項目");
  b.headerCell(10, LAST_COL, "設定場所");
  b.height(21);
  b.row++;

  const count = Math.max(10, data.relatedSettings.length);
  for (let i = 0; i < count; i++) {
    const s = data.relatedSettings[i];
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 9, s ? s.settingItem : "");
    b.dataCell(10, LAST_COL, s ? s.settingLocation : "", { wrapText: true });
    b.row++;
  }
}

/**
 * 備考（3行結合）
 */
function buildRemarks(b: SheetBuilder): void {
  b.headerCellN(0, 2, "備考", 3);
  b.dataCellN(3, LAST_COL, "", 3, { wrapText: true, vAlign: "top" });
  b.height(21);
  b.height(21, b.row + 1);
  b.height(21, b.row + 2);
  b.row += 3;
}

/**
 * 要件用語 (セクションヘッダー + テーブルヘッダー + データ行14行)
 */
function buildTerminology(b: SheetBuilder, data: ClientRequirementsDto): void {
  b.sectionHeader("要件用語");
  b.headerCell(0, 1, "Ｎｏ");
  b.headerCell(2, 9, "用語");
  b.headerCell(10, LAST_COL, "概要");
  b.height(21);
  b.row++;

  const count = Math.max(14, data.terminology.length);
  for (let i = 0; i < count; i++) {
    const t = data.terminology[i];
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 9, t ? t.term : "");
    b.dataCell(10, LAST_COL, t ? t.definition : "", { wrapText: true, vAlign: "top" });
    b.row++;
  }
}

// ── 処理概要セクション（画面あり） ──

function buildProcessContent(
  b: SheetBuilder,
  data: ClientRequirementsDto,
  screen: ScreenItem,
): void {
  b.sectionHeader("処理概要");

  // 1. ■概要（太字、フォントサイズ12）
  b.freeTextRow("■概要", { bold: true, fontSize: 12 });
  const overviewText = screen.screenOverview || data.processOverview || "";
  const overviewLines = overviewText ? overviewText.split("\n") : [];
  for (const line of overviewLines) {
    b.freeTextRow(line);
  }
  // 3-5行確保
  const overviewPad = Math.max(0, 3 - overviewLines.length);
  for (let i = 0; i < overviewPad; i++) {
    b.freeTextRow("");
  }
  b.skip(2); // 空行2行

  // 2. ■フロー（太字）
  b.freeTextRow("■フロー", { bold: true, fontSize: 12 });
  const flowText = screen.screenFlow || "";
  if (flowText) {
    const flowLines = flowText.split("\n");
    for (const line of flowLines) {
      b.freeTextRow(line);
    }
  }
  b.skip(20); // 画像差し込み用スペース

  // 3. 初期表示内容（太字行）
  b.freeTextRow("初期表示内容", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "項目", { bg: COLOR_GREEN });
  b.headerCell(8, 16, "取得テーブル", { bg: COLOR_GREEN });
  b.headerCell(17, 21, "列名", { bg: COLOR_GREEN });
  b.headerCell(22, LAST_COL, "フォーマット", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;

  const displayItems = screen.initialDisplayItems ?? [];
  const displayCount = Math.max(5, displayItems.length);
  for (let i = 0; i < displayCount; i++) {
    const item = displayItems[i];
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, item?.item ?? "");
    b.dataCell(8, 16, item?.tableName ?? "");
    b.dataCell(17, 21, item?.columnName ?? "");
    b.dataCell(22, LAST_COL, item?.format ?? "");
    b.row++;
  }
  b.skip(2); // 空行2行

  // 4. ②入力チェック（太字行）
  b.freeTextRow("②入力チェック", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "項目", { bg: COLOR_GREEN });
  b.headerCell(8, 21, "チェック内容", { bg: COLOR_GREEN });
  b.headerCell(22, LAST_COL, "エラーメッセージ", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;

  const checks = screen.inputChecks ?? [];
  const checkCount = Math.max(5, checks.length);
  for (let i = 0; i < checkCount; i++) {
    const chk = checks[i];
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, chk?.item ?? "");
    b.dataCell(8, 21, chk?.checkContent ?? "");
    b.dataCell(22, LAST_COL, chk?.errorMessage ?? "");
    b.row++;
  }
  b.skip(2); // 空行2行

  // 5. CRUD操作
  const crudOps = screen.crudOperations ?? [];
  if (crudOps.length > 0) {
    for (const op of crudOps) {
      buildCrudOperationTable(b, op);
    }
  } else {
    // デフォルト空テーブル3つ（取得/追加/更新）
    buildDefaultCrudTables(b);
  }

  // 6. 追加セクション
  const additionalSections = screen.additionalSections ?? [];
  for (const section of additionalSections) {
    b.freeTextRow(section.title, { bold: true, fontSize: 12 });
    const contentLines = section.content.split("\n");
    for (const line of contentLines) {
      b.freeTextRow(line);
    }
    b.skip(2);
  }
}

// ── 処理概要セクション（フォールバック） ──

function buildProcessContentFallback(
  b: SheetBuilder,
  data: ClientRequirementsDto,
): void {
  b.sectionHeader("処理概要");

  // ■概要
  b.freeTextRow("■概要", { bold: true, fontSize: 12 });
  const overviewText = data.processOverview || "";
  if (overviewText) {
    const lines = overviewText.split("\n");
    for (const line of lines) {
      b.freeTextRow(line);
    }
  }
  b.skip(2);

  // ■フロー
  b.freeTextRow("■フロー", { bold: true, fontSize: 12 });
  if (data.businessFlows.length > 0) {
    for (const flow of data.businessFlows) {
      b.freeTextRow(`【${flow.flowName}】`);
      if (flow.description) {
        b.freeTextRow(flow.description);
      }
      if (flow.flowSummary) {
        b.freeTextRow(flow.flowSummary);
      }
      if (flow.actors.length > 0) {
        b.freeTextRow(`関連アクター: ${flow.actors.join(", ")}`);
      }
      for (const step of flow.steps) {
        b.freeTextRow(
          `${step.stepNumber}. [${step.actor}] ${step.action}${step.details ? ` - ${step.details}` : ""}`,
        );
      }
      b.skip();
    }
  }
  b.skip(20);

  // 初期表示内容（空テーブル）
  b.freeTextRow("初期表示内容", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "項目", { bg: COLOR_GREEN });
  b.headerCell(8, 16, "取得テーブル", { bg: COLOR_GREEN });
  b.headerCell(17, 21, "列名", { bg: COLOR_GREEN });
  b.headerCell(22, LAST_COL, "フォーマット", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;
  for (let i = 0; i < 5; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 16, "");
    b.dataCell(17, 21, "");
    b.dataCell(22, LAST_COL, "");
    b.row++;
  }
  b.skip(2);

  // 入力チェック（空テーブル）
  b.freeTextRow("②入力チェック", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "項目", { bg: COLOR_GREEN });
  b.headerCell(8, 21, "チェック内容", { bg: COLOR_GREEN });
  b.headerCell(22, LAST_COL, "エラーメッセージ", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;
  for (let i = 0; i < 5; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 21, "");
    b.dataCell(22, LAST_COL, "");
    b.row++;
  }
  b.skip(2);

  // CRUD（デフォルト空テーブル3つ）
  buildDefaultCrudTables(b);
}

// ── CRUD操作テーブル構築 ──

function buildCrudOperationTable(b: SheetBuilder, op: CrudOperation): void {
  // 小見出し行（太字）
  b.freeTextRow(op.description, { bold: true, fontSize: 12 });

  // operationTypeに応じたヘッダー
  switch (op.operationType) {
    case "select":
      b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
      b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
      b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
      b.headerCell(17, 21, "処理方法", { bg: COLOR_GREEN });
      b.headerCell(22, LAST_COL, "取得条件", { bg: COLOR_GREEN });
      b.height(21);
      b.row++;
      buildCrudDataRows(b, op, "select");
      break;

    case "insert":
      b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
      b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
      b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
      b.headerCell(17, 18, "NULL可否", { bg: COLOR_GREEN });
      b.headerCell(19, 34, "登録する値", { bg: COLOR_GREEN });
      b.headerCell(35, LAST_COL, "検証", { bg: COLOR_GREEN });
      b.height(21);
      b.row++;
      buildCrudDataRows(b, op, "insert");
      break;

    case "update":
      b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
      b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
      b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
      b.headerCell(17, LAST_COL, "登録する値", { bg: COLOR_GREEN });
      b.height(21);
      b.row++;
      buildCrudDataRows(b, op, "update");
      break;

    case "delete":
      // deleteはselectと同じレイアウトを使用
      b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
      b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
      b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
      b.headerCell(17, 21, "処理方法", { bg: COLOR_GREEN });
      b.headerCell(22, LAST_COL, "取得条件", { bg: COLOR_GREEN });
      b.height(21);
      b.row++;
      buildCrudDataRows(b, op, "select");
      break;
  }

  b.skip(2); // 空行2行
}

function buildCrudDataRows(
  b: SheetBuilder,
  op: CrudOperation,
  type: "select" | "insert" | "update",
): void {
  const count = Math.max(5, op.rows.length);
  for (let i = 0; i < count; i++) {
    const r = op.rows[i];
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, r?.tableName ?? "");
    b.dataCell(8, 16, r?.columnName ?? "");

    switch (type) {
      case "select":
        b.dataCell(17, 21, r?.method ?? "");
        b.dataCell(22, LAST_COL, r?.condition ?? "");
        break;
      case "insert":
        b.dataCell(17, 18, r?.nullable ?? "");
        b.dataCell(19, 34, r?.value ?? "");
        b.dataCell(35, LAST_COL, r?.validation ?? "");
        break;
      case "update":
        b.dataCell(17, LAST_COL, r?.value ?? "");
        break;
    }
    b.row++;
  }
}

/** デフォルトCRUD空テーブル3つ（取得/追加/更新） */
function buildDefaultCrudTables(b: SheetBuilder): void {
  // 取得
  b.freeTextRow("○○テーブルの取得", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
  b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
  b.headerCell(17, 21, "処理方法", { bg: COLOR_GREEN });
  b.headerCell(22, LAST_COL, "取得条件", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;
  for (let i = 0; i < 5; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 16, "");
    b.dataCell(17, 21, "");
    b.dataCell(22, LAST_COL, "");
    b.row++;
  }
  b.skip(2);

  // 追加
  b.freeTextRow("○○テーブルへの追加", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
  b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
  b.headerCell(17, 18, "NULL可否", { bg: COLOR_GREEN });
  b.headerCell(19, 34, "登録する値", { bg: COLOR_GREEN });
  b.headerCell(35, LAST_COL, "検証", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;
  for (let i = 0; i < 5; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 16, "");
    b.dataCell(17, 18, "");
    b.dataCell(19, 34, "");
    b.dataCell(35, LAST_COL, "");
    b.row++;
  }
  b.skip(2);

  // 更新
  b.freeTextRow("○○テーブルの更新", { bold: true, fontSize: 12 });
  b.headerCell(0, 1, "No", { bg: COLOR_GREEN });
  b.headerCell(2, 7, "テーブル名", { bg: COLOR_GREEN });
  b.headerCell(8, 16, "列名", { bg: COLOR_GREEN });
  b.headerCell(17, LAST_COL, "登録する値", { bg: COLOR_GREEN });
  b.height(21);
  b.row++;
  for (let i = 0; i < 5; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 16, "");
    b.dataCell(17, LAST_COL, "");
    b.row++;
  }
  b.skip(2);
}

/**
 * 出力パラメータ（入力パラメータと同じレイアウト、20行）
 */
function buildOutputParams(b: SheetBuilder, data: ClientRequirementsDto, screen?: ScreenItem): void {
  b.sectionHeader("出力パラメータ");
  buildParamHeader(b);
  const params = screen?.outputParameters ?? data.outputParameters;
  const count = Math.max(20, params.length);
  for (let i = 0; i < count; i++) {
    const p = params[i];
    buildParamRow(b, i + 1, p);
  }
}

/**
 * 更新履歴
 */
function buildUpdateHistory(b: SheetBuilder): void {
  b.sectionHeader("更新履歴");
  b.headerCell(0, 1, "Ｎｏ");
  b.headerCell(2, 7, "更新日");
  b.headerCell(8, 16, "更新者");
  b.headerCell(17, LAST_COL, "更新内容");
  b.height(21);
  b.row++;

  for (let i = 0; i < 10; i++) {
    b.dataCell(0, 1, i + 1, { hAlign: "center" });
    b.dataCell(2, 7, "");
    b.dataCell(8, 16, "");
    b.dataCell(17, LAST_COL, "", { wrapText: true });
    b.row++;
  }
}
