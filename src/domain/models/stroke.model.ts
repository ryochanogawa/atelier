/**
 * Stroke Model
 * ワークフローの実行ステップ（エンティティ）。
 */

import type { Transition } from "../value-objects/transition.vo.js";
import {
  StrokeStatus,
  isValidStrokeTransition,
} from "../value-objects/stroke-status.vo.js";
import { StrokeError } from "../errors/atelier-error.js";

/** Conductor 定義（Phase 3 ステータス判定） */
export interface ConductorDefinition {
  readonly palette?: string;  // デフォルト: "conductor"
  readonly rules?: readonly { condition: string; next: string }[];
}

/** Team Leader 定義（タスク自動分割 + 並列実行） */
export interface TeamLeaderDefinition {
  /** 最大分割数（デフォルト: 5） */
  readonly maxParts: number;
  /** 各 worker が使用する Palette 名 */
  readonly partPersona?: string;
  /** 各 worker が使用する Medium 名 */
  readonly partMedium?: string;
  /** worker にファイル編集を許可するか */
  readonly partAllowEdit?: boolean;
}

/** Parallel Sub-Stroke 定義（並列実行されるサブストローク） */
export interface ParallelSubStroke {
  readonly name: string;
  readonly palette: string;
  readonly instruction: string;
  readonly knowledge?: readonly string[];
  readonly contract?: string;
}

/** Arpeggio 設定（CSV × テンプレート × バッチ処理） */
export interface ArpeggioConfig {
  /** CSV ファイルの絶対パス */
  readonly sourcePath: string;
  /** 1バッチあたりの行数 */
  readonly batchSize: number;
  /** 並列実行数 */
  readonly concurrency: number;
  /** マージ戦略 */
  readonly merge: "concat" | "custom";
  /** concat 時のセパレータ */
  readonly separator: string;
  /** バッチ失敗時の最大リトライ回数 */
  readonly maxRetries: number;
  /** リトライ間隔ミリ秒 */
  readonly retryDelayMs: number;
}

export interface StrokeDefinition {
  readonly name: string;
  readonly palette: string;
  readonly medium: string;
  readonly allowEdit: boolean;
  readonly instruction: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly transitions: readonly Transition[];
  readonly dependsOn?: readonly string[];
  readonly contract: string;
  readonly knowledge?: readonly string[];
  readonly arpeggio?: ArpeggioConfig;
  readonly conductor?: ConductorDefinition;
  readonly teamLeader?: TeamLeaderDefinition;
  readonly parallel?: readonly ParallelSubStroke[];
}

export class Stroke {
  readonly name: string;
  readonly palette: string;
  readonly medium: string;
  readonly allowEdit: boolean;
  readonly instruction: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly transitions: readonly Transition[];
  readonly dependsOn: readonly string[];
  readonly contract: string;
  readonly knowledge: readonly string[];
  readonly arpeggio?: ArpeggioConfig;
  readonly conductor?: ConductorDefinition;
  readonly teamLeader?: TeamLeaderDefinition;
  readonly parallel?: readonly ParallelSubStroke[];

  private _status: StrokeStatus;

  constructor(definition: StrokeDefinition) {
    if (!definition.name.trim()) {
      throw new StrokeError(definition.name, "Stroke name must not be empty");
    }
    this.name = definition.name;
    this.palette = definition.palette;
    this.medium = definition.medium;
    this.allowEdit = definition.allowEdit;
    this.instruction = definition.instruction;
    this.inputs = Object.freeze([...definition.inputs]);
    this.outputs = Object.freeze([...definition.outputs]);
    this.transitions = Object.freeze([...definition.transitions]);
    this.dependsOn = Object.freeze([...(definition.dependsOn ?? [])]);
    this.contract = definition.contract ?? "";
    this.knowledge = Object.freeze([...(definition.knowledge ?? [])]);
    this.arpeggio = definition.arpeggio
      ? Object.freeze({ ...definition.arpeggio })
      : undefined;
    this.conductor = definition.conductor
      ? Object.freeze({ ...definition.conductor })
      : undefined;
    this.teamLeader = definition.teamLeader
      ? Object.freeze({ ...definition.teamLeader })
      : undefined;
    this.parallel = definition.parallel
      ? Object.freeze(definition.parallel.map(p => Object.freeze({ ...p })))
      : undefined;
    this._status = StrokeStatus.Pending;
  }

  get status(): StrokeStatus {
    return this._status;
  }

  transitionTo(newStatus: StrokeStatus): void {
    if (!isValidStrokeTransition(this._status, newStatus)) {
      throw new StrokeError(
        this.name,
        `Invalid stroke transition: ${this._status} -> ${newStatus}`,
      );
    }
    this._status = newStatus;
  }

  get isTerminal(): boolean {
    return (
      this._status === StrokeStatus.Completed ||
      this._status === StrokeStatus.Failed ||
      this._status === StrokeStatus.Skipped
    );
  }
}
