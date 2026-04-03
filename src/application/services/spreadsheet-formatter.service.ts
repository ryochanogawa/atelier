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

// ── 定数 ──

const COLOR_HEADER_BG: RgbaColor = { red: 0.2, green: 0.27, blue: 0.55 };
const COLOR_HEADER_TEXT: RgbaColor = { red: 1, green: 1, blue: 1 };
const COLOR_SUBHEADER_BG: RgbaColor = { red: 0.85, green: 0.92, blue: 0.98 };
const COLOR_LABEL_BG: RgbaColor = { red: 0.93, green: 0.93, blue: 0.93 };
const COLOR_WHITE: RgbaColor = { red: 1, green: 1, blue: 1 };
const COLOR_ACTOR_COLORS: RgbaColor[] = [
  { red: 0.92, green: 0.96, blue: 1 },
  { red: 1, green: 0.95, blue: 0.88 },
  { red: 0.9, green: 1, blue: 0.9 },
  { red: 1, green: 0.92, blue: 0.92 },
  { red: 0.95, green: 0.92, blue: 1 },
];

const DEFAULT_COL_WIDTH = 200;
const SWIMLANE_COL_WIDTH = 220;
const NARROW_COL_WIDTH = 80;
const WIDE_COL_WIDTH = 300;
const HEADER_ROW_HEIGHT = 36;
const DEFAULT_ROW_HEIGHT = 28;

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

// ── 表紙シート ──

function buildCoverSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  // タイトルヘッダー
  cells.push({ row, col: 0, value: data.projectInfo.documentTitle || "要件定義書" });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 5 });
  formats.push({
    row, col: 0, endRow: row, endCol: 5,
    bold: true, fontSize: 18,
    bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
    hAlign: "center", vAlign: "middle",
    borderBottom: "medium",
  });
  row += 2;

  // メタ情報テーブル
  const metaFields: [string, string][] = [
    ["プロジェクト名", data.projectInfo.projectName],
    ["バージョン", data.projectInfo.version],
    ["作成者", data.projectInfo.author],
    ["作成日", data.projectInfo.createdDate],
    ["更新日", data.projectInfo.updatedDate],
  ];

  for (const [label, value] of metaFields) {
    cells.push({ row, col: 1, value: label });
    cells.push({ row, col: 2, value });
    merges.push({ startRow: row, endRow: row, startCol: 2, endCol: 4 });
    formats.push({
      row, col: 1,
      bold: true, bgColor: COLOR_LABEL_BG,
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
    formats.push({
      row, col: 2, endCol: 4,
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
    row++;
  }
  row += 2;

  // 処理概要
  if (data.processOverview) {
    cells.push({ row, col: 0, value: "処理概要" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 5 });
    formats.push({
      row, col: 0, endCol: 5,
      bold: true, fontSize: 13, bgColor: COLOR_SUBHEADER_BG,
      borderBottom: "medium",
    });
    row++;

    cells.push({ row, col: 0, value: data.processOverview });
    merges.push({ startRow: row, endRow: row + 3, startCol: 0, endCol: 5 });
    formats.push({
      row, col: 0, endRow: row + 3, endCol: 5,
      wrapText: true, vAlign: "top",
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
    row += 5;
  }

  // 関連設定
  if (data.relatedSettings.length > 0) {
    cells.push({ row, col: 0, value: "関連設定" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 5 });
    formats.push({
      row, col: 0, endCol: 5,
      bold: true, fontSize: 13, bgColor: COLOR_SUBHEADER_BG,
      borderBottom: "medium",
    });
    row++;

    const settingHeaders = ["設定項目", "設定場所", "備考"];
    for (let c = 0; c < settingHeaders.length; c++) {
      cells.push({ row, col: c, value: settingHeaders[c] });
      formats.push({
        row, col: c,
        bold: true, bgColor: COLOR_LABEL_BG,
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
    }
    row++;

    for (const setting of data.relatedSettings) {
      cells.push({ row, col: 0, value: setting.settingItem });
      cells.push({ row, col: 1, value: setting.settingLocation });
      cells.push({ row, col: 2, value: setting.remarks });
      for (let c = 0; c < 3; c++) {
        formats.push({
          row, col: c,
          borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
        });
      }
      row++;
    }
  }

  return {
    sheetName: "表紙",
    cells,
    merges,
    formats,
    columnWidths: [
      { col: 0, width: 60 },
      { col: 1, width: 160 },
      { col: 2, width: DEFAULT_COL_WIDTH },
      { col: 3, width: DEFAULT_COL_WIDTH },
      { col: 4, width: DEFAULT_COL_WIDTH },
      { col: 5, width: DEFAULT_COL_WIDTH },
    ],
    rowHeights: [{ row: 0, height: 50 }],
    frozenRows: 1,
  };
}

// ── 要件一覧シート ──

function buildRequirementsSheet(data: ClientRequirementsDto): SheetDefinition {
  const cells: CellValue[] = [];
  const merges: MergeRange[] = [];
  const formats: CellFormat[] = [];
  let row = 0;

  // ヘッダー行
  const headers = ["No", "要件ID", "カテゴリ", "要件名", "説明", "優先度", "受け入れ基準"];
  for (let c = 0; c < headers.length; c++) {
    cells.push({ row, col: c, value: headers[c] });
    formats.push({
      row, col: c,
      bold: true,
      bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
      hAlign: "center", vAlign: "middle",
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
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
      formats.push({
        row, col: c,
        wrapText: true, vAlign: "top",
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
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

// ── 業務フローシート（スイムレーン形式） ──

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

  // フローヘッダー: タイトル + 説明
  cells.push({ row, col: 0, value: `業務フロー${flowIndex}: ${flow.flowName}` });
  merges.push({ startRow: row, endRow: row, startCol: 0, endCol: actorCount });
  formats.push({
    row, col: 0, endCol: actorCount,
    bold: true, fontSize: 14,
    bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
    hAlign: "center", vAlign: "middle",
  });
  rowHeights.push({ row, height: 40 });
  row++;

  if (flow.description) {
    cells.push({ row, col: 0, value: flow.description });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: actorCount });
    formats.push({
      row, col: 0, endCol: actorCount,
      wrapText: true, italic: true,
      borderBottom: "medium",
    });
    row++;
  }

  // スイムレーンヘッダー: ステップNo + アクター列
  cells.push({ row, col: 0, value: "No" });
  formats.push({
    row, col: 0,
    bold: true, bgColor: COLOR_LABEL_BG,
    hAlign: "center", vAlign: "middle",
    borderTop: "medium", borderBottom: "medium", borderLeft: "medium", borderRight: "thin",
  });

  for (let a = 0; a < actorCount; a++) {
    cells.push({ row, col: a + 1, value: actors[a] });
    const actorColor = COLOR_ACTOR_COLORS[a % COLOR_ACTOR_COLORS.length];
    formats.push({
      row, col: a + 1,
      bold: true, bgColor: actorColor,
      hAlign: "center", vAlign: "middle",
      borderTop: "medium", borderBottom: "medium", borderLeft: "thin", borderRight: a === actorCount - 1 ? "medium" : "thin",
    });
  }
  rowHeights.push({ row, height: HEADER_ROW_HEIGHT });
  row++;

  // フローステップ行
  for (const step of flow.steps) {
    const actorIndex = actors.indexOf(step.actor);
    const targetCol = actorIndex >= 0 ? actorIndex + 1 : 1;

    // ステップ番号
    cells.push({ row, col: 0, value: step.stepNumber });
    formats.push({
      row, col: 0,
      hAlign: "center", vAlign: "middle",
      bgColor: COLOR_LABEL_BG,
      borderTop: "thin", borderBottom: "thin", borderLeft: "medium", borderRight: "thin",
    });

    // アクション内容を該当アクターの列に配置
    let cellContent = step.action;
    if (step.details) {
      cellContent += `\n${step.details}`;
    }

    // 分岐条件がある場合
    if (step.branchCondition) {
      cellContent += `\n【判断】${step.branchCondition}`;
      if (step.branchYes) cellContent += `\n → Yes: ステップ${step.branchYes}`;
      if (step.branchNo) cellContent += `\n → No: ステップ${step.branchNo}`;
    }

    cells.push({ row, col: targetCol, value: cellContent });

    // 全アクター列にボーダーを設定
    for (let a = 0; a < actorCount; a++) {
      const col = a + 1;
      const isTarget = col === targetCol;
      const actorColor = COLOR_ACTOR_COLORS[a % COLOR_ACTOR_COLORS.length];

      formats.push({
        row, col,
        wrapText: true, vAlign: "middle",
        bgColor: isTarget ? actorColor : COLOR_WHITE,
        bold: isTarget && !!step.branchCondition,
        borderTop: "thin", borderBottom: "thin",
        borderLeft: "thin",
        borderRight: a === actorCount - 1 ? "medium" : "thin",
      });
    }

    // 分岐ステップは高さを広くする
    if (step.branchCondition) {
      rowHeights.push({ row, height: 80 });
    } else if (step.details) {
      rowHeights.push({ row, height: 50 });
    } else {
      rowHeights.push({ row, height: DEFAULT_ROW_HEIGHT });
    }

    row++;
  }

  // 列幅
  const columnWidths: ColumnWidth[] = [
    { col: 0, width: 50 },
    ...actors.map((_, a) => ({ col: a + 1, width: SWIMLANE_COL_WIDTH })),
  ];

  return {
    sheetName: `フロー${flowIndex}_${flow.flowName}`.slice(0, 31),
    cells,
    merges,
    formats,
    columnWidths,
    rowHeights,
    frozenRows: row > 3 ? (flow.description ? 3 : 2) : undefined,
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
    formats.push({
      row, col: c,
      bold: true,
      bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
      hAlign: "center", vAlign: "middle",
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
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
      formats.push({
        row, col: c,
        wrapText: true, vAlign: "top",
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
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

  const headers = ["No", "データID", "項目名", "桁数", "型", "摘要"];

  // 入力パラメータ
  if (data.inputParameters.length > 0) {
    cells.push({ row, col: 0, value: "入力パラメータ" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 5 });
    formats.push({
      row, col: 0, endCol: 5,
      bold: true, fontSize: 13, bgColor: COLOR_SUBHEADER_BG,
      borderBottom: "medium",
    });
    row++;

    for (let c = 0; c < headers.length; c++) {
      cells.push({ row, col: c, value: headers[c] });
      formats.push({
        row, col: c,
        bold: true, bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
        hAlign: "center",
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
    }
    row++;

    for (const param of data.inputParameters) {
      const values = [param.no, param.dataId, param.itemName, param.digits, param.type, param.remarks];
      for (let c = 0; c < values.length; c++) {
        cells.push({ row, col: c, value: values[c] });
        formats.push({
          row, col: c,
          borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
        });
      }
      row++;
    }
    row++;
  }

  // 出力パラメータ
  if (data.outputParameters.length > 0) {
    cells.push({ row, col: 0, value: "出力パラメータ" });
    merges.push({ startRow: row, endRow: row, startCol: 0, endCol: 5 });
    formats.push({
      row, col: 0, endCol: 5,
      bold: true, fontSize: 13, bgColor: COLOR_SUBHEADER_BG,
      borderBottom: "medium",
    });
    row++;

    for (let c = 0; c < headers.length; c++) {
      cells.push({ row, col: c, value: headers[c] });
      formats.push({
        row, col: c,
        bold: true, bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
        hAlign: "center",
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
    }
    row++;

    for (const param of data.outputParameters) {
      const values = [param.no, param.dataId, param.itemName, param.digits, param.type, param.remarks];
      for (let c = 0; c < values.length; c++) {
        cells.push({ row, col: c, value: values[c] });
        formats.push({
          row, col: c,
          borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
        });
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

  const headers = ["No", "用語", "定義・説明", "関連ドメイン"];
  for (let c = 0; c < headers.length; c++) {
    cells.push({ row, col: c, value: headers[c] });
    formats.push({
      row, col: c,
      bold: true,
      bgColor: COLOR_HEADER_BG, textColor: COLOR_HEADER_TEXT,
      hAlign: "center", vAlign: "middle",
      borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
    });
  }
  row++;

  for (let i = 0; i < data.terminology.length; i++) {
    const term = data.terminology[i];
    const values = [i + 1, term.term, term.definition, term.relatedDomain];
    for (let c = 0; c < values.length; c++) {
      cells.push({ row, col: c, value: values[c] });
      formats.push({
        row, col: c,
        wrapText: true, vAlign: "top",
        borderTop: "thin", borderBottom: "thin", borderLeft: "thin", borderRight: "thin",
      });
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
