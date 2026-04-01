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

// ─── Layout ────────────────────────────────────────────

/** レイアウトプリセット名 */
export type ThemeLayoutPreset = "standard" | "codec" | "custom";

/** ASCII アートアセット定義 */
export interface ThemeAsciiAsset {
  /** 行ごとの文字列配列 */
  readonly lines: readonly string[];
  /** 幅(列数) */
  readonly width: number;
  /** 高さ(行数) */
  readonly height: number;
}

/** 通信画面のヘッダー設定 */
export interface ThemeLayoutHeader {
  /** ヘッダーに表示するラベル（例: "CODEC 141.80"） */
  readonly label: string;
  /** 周波数・チャンネル表示（オプション） */
  readonly frequency?: string;
}

/** パネル（通信者）定義 */
export interface ThemeLayoutPanel {
  /** パネル名 */
  readonly name: string;
  /** ASCII アートアバター（オプション） */
  readonly avatar?: ThemeAsciiAsset;
}

/** レイアウト定義 */
export interface ThemeLayout {
  /** プリセット名: 描画エンジンがこの値で分岐する */
  readonly preset: ThemeLayoutPreset;
  /** 通信画面ヘッダー（codec 等で使用） */
  readonly header?: ThemeLayoutHeader;
  /** 左パネル（ユーザー側） */
  readonly userPanel?: ThemeLayoutPanel;
  /** 右パネル（AI 側） */
  readonly assistantPanel?: ThemeLayoutPanel;
}

// ─── Animations ────────────────────────────────────────

/** イージング関数名 */
export type ThemeEasing = "linear" | "ease-in" | "ease-out" | "step";

/** 単一アニメーション定義 */
export interface ThemeAnimationDef {
  /** アニメーションを有効にするか */
  readonly enabled: boolean;
  /** 持続時間 (ms) */
  readonly durationMs: number;
  /** イージング */
  readonly easing: ThemeEasing;
}

/** テーマが提供するアニメーション群 */
export interface ThemeAnimations {
  /** タイプライター効果（1 文字ずつ表示） */
  readonly typewriter?: ThemeAnimationDef;
  /** 通信開始トランジション */
  readonly transitionIn?: ThemeAnimationDef;
  /** 通信終了トランジション */
  readonly transitionOut?: ThemeAnimationDef;
  /** スキャンライン / ノイズ効果 */
  readonly scanline?: ThemeAnimationDef;
}

// ─── Sound ─────────────────────────────────────────────

/** サウンドイベント定義 */
export interface ThemeSoundDef {
  /** サウンドを有効にするか */
  readonly enabled: boolean;
  /** BEL 文字を鳴らすか、または外部ファイルパス */
  readonly type: "bel" | "file";
  /** type が "file" の場合のファイルパス（テーマパッケージ相対） */
  readonly path?: string;
}

/** テーマが提供するサウンド群 */
export interface ThemeSounds {
  /** 通信開始音 */
  readonly connect?: ThemeSoundDef;
  /** 通信終了音 */
  readonly disconnect?: ThemeSoundDef;
  /** メッセージ受信音 */
  readonly messageReceive?: ThemeSoundDef;
}

// ─── ThemePort ─────────────────────────────────────────

/** ThemePort: テーマ全体のインターフェース */
export interface ThemePort {
  readonly meta: ThemeMeta;
  readonly colors: ThemeColors;
  readonly symbols: ThemeSymbols;
  readonly borders: ThemeBorders;
  readonly tableStyle: ThemeTableStyle;

  /** レイアウト定義（省略時は standard） */
  readonly layout?: ThemeLayout;
  /** アニメーション定義（省略時はアニメーションなし） */
  readonly animations?: ThemeAnimations;
  /** サウンド定義（省略時はサウンドなし） */
  readonly sounds?: ThemeSounds;
}
