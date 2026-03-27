/**
 * Config Port
 * 設定ファイルの読み込みポート（インターフェースのみ）。
 */

import type { Palette } from "../models/palette.model.js";
import type { Facet } from "../value-objects/facet.vo.js";

export interface StudioConfig {
  readonly defaultMedium: string;
  readonly mediums: ReadonlyMap<string, MediumConfig>;
  readonly palettesDir: string;
  readonly commissionsDir: string;
}

export interface MediumConfig {
  readonly provider: string;
  readonly model: string;
  readonly apiKeyEnv: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface CommissionConfig {
  readonly name: string;
  readonly description: string;
  readonly initialStroke: string;
  readonly maxStrokes: number;
  readonly strokes: readonly StrokeConfig[];
}

export interface StrokeConfig {
  readonly name: string;
  readonly palette: string;
  readonly medium: string;
  readonly allowEdit: boolean;
  readonly instruction: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly transitions: readonly TransitionConfig[];
}

export interface TransitionConfig {
  readonly condition: string;
  readonly next: string;
  readonly maxRetries?: number;
  readonly onMaxRetries?: string;
}

export interface ConfigPort {
  /** スタジオ設定を読み込む */
  loadStudioConfig(basePath: string): Promise<StudioConfig>;

  /** Commission定義を読み込む */
  loadCommission(name: string): Promise<CommissionConfig>;

  /** Palette定義を読み込む */
  loadPalette(name: string): Promise<Palette>;

  /** Policy定義を読み込む */
  loadPolicy(name: string): Promise<Facet>;
}
