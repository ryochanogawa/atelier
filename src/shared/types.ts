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
  /** タスク説明文（Canvas の "task" キーとして自動注入される） */
  readonly task?: string;
}

/** Palette ごとの Provider 設定 */
export interface PaletteProviderConfig {
  readonly medium?: string;
  readonly model?: string;
}

/** 通知イベント設定 */
export interface NotificationEventsConfig {
  readonly commission_complete?: boolean;
  readonly commission_abort?: boolean;
  readonly task_complete?: boolean;
}

/** 通知設定 */
export interface NotificationConfig {
  readonly sound?: boolean;
  readonly events?: NotificationEventsConfig;
}

/** ランタイム設定 */
export interface RuntimeConfig {
  /** Commission 実行前に走る準備スクリプト */
  readonly prepare?: readonly string[];
}

/** Studio 設定 */
export interface StudioConfig {
  readonly defaultMedium: string;
  readonly language: string;
  readonly logLevel: LogLevel;
  /** タスク並列実行数（1-10、デフォルト: 1） */
  readonly concurrency?: number;
  /** ベースブランチ（デフォルト: 自動検出） */
  readonly baseBranch?: string;
  /** CI向け出力抑制（デフォルト: false） */
  readonly minimalOutput?: boolean;
  /** Palette ごとの medium/model オーバーライド */
  readonly paletteProviders?: Readonly<Record<string, PaletteProviderConfig>>;
  /** Git操作時にhooksを許可するか（デフォルト: false） */
  readonly allowGitHooks?: boolean;
  /** worktreeの作成先ディレクトリ（デフォルト: ".atelier/worktrees/"） */
  readonly worktreeDir?: string;
  /** 通知設定 */
  readonly notification?: NotificationConfig;
  /** ランタイム設定 */
  readonly runtime?: RuntimeConfig;
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
  /** 指定されたstrokeから実行を開始する。未指定時は先頭stroke */
  readonly initial_stroke?: string;
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

/** Quality Gate 定義 (YAML由来) */
export interface QualityGateYaml {
  readonly name: string;
  readonly condition: string;
}

/** Output Contract 定義 (YAML由来) — 複数ファイル出力 */
export interface OutputContractYaml {
  readonly name: string;      // ファイル名（例: "plan.md"）
  readonly format?: string;   // Contract名 or インラインフォーマット
}

/** Stroke 定義 (YAML由来) */
export interface StrokeDefinitionYaml {
  readonly name: string;
  readonly palette: string;
  readonly medium?: string;
  readonly allow_edit?: boolean;
  /** 権限モード: readonly/edit/full（allow_editの拡張） */
  readonly permission_mode?: "readonly" | "edit" | "full";
  readonly instruction: string;
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly transitions?: readonly TransitionDefinitionYaml[];
  readonly depends_on?: readonly string[];
  readonly contract?: string;
  readonly knowledge?: readonly string[];
  readonly policy?: string;
  readonly model?: string;
  readonly allowed_tools?: readonly string[];
  readonly arpeggio?: ArpeggioDefinitionYaml;
  readonly conductor?: {
    readonly palette?: string;  // デフォルト: "conductor"
    readonly rules?: readonly { condition: string; next: string }[];
  };
  readonly team_leader?: TeamLeaderDefinitionYaml;
  readonly parallel?: readonly ParallelStrokeYaml[];
  /** stroke完了後の品質チェック条件 */
  readonly quality_gates?: readonly QualityGateYaml[];
  /** 複数ファイル出力契約（report_dir 配下に出力） */
  readonly output_contracts?: readonly OutputContractYaml[];
}

/** Pipeline テンプレート変数 */
export interface PipelineTemplateVars {
  /** タスク説明文 */
  readonly task: string;
  /** 使用した Commission 名 */
  readonly commission: string;
  /** ブランチ名 */
  readonly branch: string;
  /** 実行日 (YYYY-MM-DD) */
  readonly date: string;
}

/** Pipeline 設定（studio.yaml の pipeline セクション） */
export interface PipelineConfig {
  /** ブランチ名プレフィックス (デフォルト: "atelier/") */
  readonly branchPrefix?: string;
  /** コミットメッセージテンプレート (例: "atelier: {{task}}") */
  readonly commitMessageTemplate?: string;
  /** PR タイトルテンプレート (例: "[ATELIER] {{task}}") */
  readonly prTitleTemplate?: string;
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
  /** 遷移発火時に次strokeのinstructionに追加するテキスト */
  readonly appendix?: string;
}
