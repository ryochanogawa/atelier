/**
 * Shared Types
 * Branded Types およびプロジェクト横断の型定義。
 */

/**
 * Branded Type ユーティリティ。
 * プリミティブ型に意味的な型タグを付与し、型安全性を高める。
 */
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Run 実行 ID */
export type RunId = Brand<string, "RunId">;

/** Commission 名 */
export type CommissionName = Brand<string, "CommissionName">;

/** Medium 名 */
export type MediumName = Brand<string, "MediumName">;

/** Stroke 名 */
export type StrokeName = Brand<string, "StrokeName">;

/** ファイルパス */
export type FilePath = Brand<string, "FilePath">;

/** Branded 値の生成ヘルパー */
export function asRunId(value: string): RunId {
  return value as RunId;
}

export function asCommissionName(value: string): CommissionName {
  return value as CommissionName;
}

export function asMediumName(value: string): MediumName {
  return value as MediumName;
}

export function asStrokeName(value: string): StrokeName {
  return value as StrokeName;
}

export function asFilePath(value: string): FilePath {
  return value as FilePath;
}

/** ログレベル */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 実行オプション */
export interface RunOptions {
  readonly dryRun: boolean;
  readonly medium?: string;
  readonly tui?: boolean;
  readonly verbose?: boolean;
  /** Canvas に事前注入するキーバリュー（要件定義等） */
  readonly initialCanvas?: Readonly<Record<string, string>>;
}

/** Studio 設定 */
export interface StudioConfig {
  readonly defaultMedium: string;
  readonly language: string;
  readonly logLevel: LogLevel;
}

/** Medium 設定 */
export interface MediumConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timeout?: number;
}

/** Loop Monitor 定義 (YAML由来) */
export interface LoopMonitorYaml {
  readonly cycle: readonly string[];
  readonly threshold: number;
  readonly on_threshold?: "fail" | "skip" | "force_complete";
}

/** Commission 定義 (YAML由来) */
export interface CommissionDefinition {
  readonly name: string;
  readonly description: string;
  readonly strokes: readonly StrokeDefinitionYaml[];
  readonly loop_monitors?: readonly LoopMonitorYaml[];
}

/** Team Leader 定義 (YAML由来) */
export interface TeamLeaderDefinitionYaml {
  /** 最大分割数（デフォルト: 5） */
  readonly max_parts?: number;
  /** 各 worker が使用する Palette 名 */
  readonly part_persona?: string;
  /** 各 worker が使用する Medium 名 */
  readonly part_medium?: string;
  /** worker にファイル編集を許可するか */
  readonly part_allow_edit?: boolean;
}

/** Arpeggio 定義 (YAML由来) — CSV × テンプレート × バッチ処理 */
export interface ArpeggioDefinitionYaml {
  /** CSV ファイルパス（プロジェクトルートからの相対パス） */
  readonly source: string;
  /** 1バッチあたりの行数（デフォルト: 1） */
  readonly batch_size?: number;
  /** 並列実行数（デフォルト: 1） */
  readonly concurrency?: number;
  /** マージ戦略（デフォルト: "concat"） */
  readonly merge?: "concat" | "custom";
  /** concat 時のセパレータ（デフォルト: "\n"） */
  readonly separator?: string;
  /** バッチ失敗時の最大リトライ回数（デフォルト: 2） */
  readonly max_retries?: number;
  /** リトライ間隔ミリ秒（デフォルト: 1000） */
  readonly retry_delay_ms?: number;
}

/** Parallel Stroke 定義 (YAML由来) — 並列実行されるサブストローク */
export interface ParallelStrokeYaml {
  readonly name: string;
  readonly palette: string;
  readonly instruction: string;
  readonly knowledge?: readonly string[];
  readonly contract?: string;
}

/** Stroke 定義 (YAML由来) */
export interface StrokeDefinitionYaml {
  readonly name: string;
  readonly palette: string;
  readonly medium?: string;
  readonly allow_edit?: boolean;
  readonly instruction: string;
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly transitions?: readonly TransitionDefinitionYaml[];
  readonly depends_on?: readonly string[];
  readonly contract?: string;
  readonly knowledge?: readonly string[];
  readonly arpeggio?: ArpeggioDefinitionYaml;
  readonly conductor?: {
    readonly palette?: string;  // デフォルト: "conductor"
    readonly rules?: readonly { condition: string; next: string }[];
  };
  readonly team_leader?: TeamLeaderDefinitionYaml;
  readonly parallel?: readonly ParallelStrokeYaml[];
}

/** Pipeline 設定（studio.yaml の pipeline セクション） */
export interface PipelineConfig {
  /** コミットメッセージテンプレート (例: "feat: {title} (#{issue})") */
  readonly commitMessageTemplate?: string;
  /** PR 本文テンプレート */
  readonly prBodyTemplate?: string;
  /** Slack Webhook URL */
  readonly slackWebhookUrl?: string;
}

/** Transition 定義 (YAML由来) */
export interface TransitionDefinitionYaml {
  readonly condition: string;
  readonly next: string;
  readonly max_retries?: number;
  readonly on_max_retries?: "fail" | "skip" | "continue";
}
