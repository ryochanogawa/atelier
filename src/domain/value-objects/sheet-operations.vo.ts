/**
 * Sheet Operations Value Objects
 * スプレッドシート操作のための値オブジェクト群。
 */

/** セル座標 */
export interface CellPosition {
  readonly row: number;
  readonly col: number;
}

/** セル値 */
export interface CellValue {
  readonly row: number;
  readonly col: number;
  readonly value: string | number;
}

/** セル結合範囲 */
export interface MergeRange {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
}

/** 水平揃え */
export type HorizontalAlign = "left" | "center" | "right";

/** 垂直揃え */
export type VerticalAlign = "top" | "middle" | "bottom";

/** 罫線スタイル */
export type BorderStyle = "none" | "thin" | "medium" | "thick";

/** RGBAカラー (0.0 - 1.0) */
export interface RgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha?: number;
}

/** セルフォーマット */
export interface CellFormat {
  readonly row: number;
  readonly col: number;
  readonly endRow?: number;
  readonly endCol?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly fontSize?: number;
  readonly bgColor?: RgbaColor;
  readonly textColor?: RgbaColor;
  readonly hAlign?: HorizontalAlign;
  readonly vAlign?: VerticalAlign;
  readonly wrapText?: boolean;
  readonly borderTop?: BorderStyle;
  readonly borderBottom?: BorderStyle;
  readonly borderLeft?: BorderStyle;
  readonly borderRight?: BorderStyle;
}

/** 列幅指定 */
export interface ColumnWidth {
  readonly col: number;
  readonly width: number;
}

/** 行高さ指定 */
export interface RowHeight {
  readonly row: number;
  readonly height: number;
}

/** 1つのシート定義 */
export interface SheetDefinition {
  readonly sheetName: string;
  readonly cells: readonly CellValue[];
  readonly merges: readonly MergeRange[];
  readonly formats: readonly CellFormat[];
  readonly columnWidths: readonly ColumnWidth[];
  readonly rowHeights: readonly RowHeight[];
  readonly frozenRows?: number;
  readonly frozenCols?: number;
}

/** スプレッドシートドキュメント全体 */
export interface SpreadsheetDocument {
  readonly title: string;
  readonly sheets: readonly SheetDefinition[];
}
