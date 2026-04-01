/**
 * Theme Port
 * CLI UIテーマの抽象インターフェース。
 * Domain層は外部ライブラリ(chalk等)に依存しないため、
 * 色はhex文字列、シンボルはUnicode文字列で表現する。
 */

/** カラーパレット定義（hex文字列） */
export interface ThemeColors {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly muted: string;
  readonly text: string;
  readonly success: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
}

/** シンボル定義（Unicode文字） */
export interface ThemeSymbols {
  readonly brand: string;
  readonly success: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  readonly bullet: string;
  readonly arrow: string;
  readonly line: string;
}

/** ボーダー文字定義 */
export interface ThemeBorders {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  readonly titleLeft: string;
  readonly titleRight: string;
}

/** テーブルスタイル定義（cli-table3互換キー） */
export interface ThemeTableStyle {
  readonly [key: string]: string;
}

/** テーマメタデータ */
export interface ThemeMeta {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description?: string;
}

/** ThemePort: テーマ全体のインターフェース */
export interface ThemePort {
  readonly meta: ThemeMeta;
  readonly colors: ThemeColors;
  readonly symbols: ThemeSymbols;
  readonly borders: ThemeBorders;
  readonly tableStyle: ThemeTableStyle;
}
