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
