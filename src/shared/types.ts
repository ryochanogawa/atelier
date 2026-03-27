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

/** Commission 定義 (YAML由来) */
export interface CommissionDefinition {
  readonly name: string;
  readonly description: string;
  readonly strokes: readonly StrokeDefinitionYaml[];
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
}

/** Transition 定義 (YAML由来) */
export interface TransitionDefinitionYaml {
  readonly condition: string;
  readonly next: string;
  readonly max_retries?: number;
  readonly on_max_retries?: "fail" | "skip" | "continue";
}
