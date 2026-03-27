/**
 * Commission Aggregate Root
 * ワークフロー全体を統括する集約ルート。
 * 状態遷移の不変条件を保証し、ドメインイベントを発行する。
 */

import { Stroke, type StrokeDefinition } from "../models/stroke.model.js";
import { Canvas } from "../models/canvas.model.js";
import {
  CommissionStatus,
  isValidCommissionTransition,
} from "../value-objects/commission-status.vo.js";
import { StrokeStatus } from "../value-objects/stroke-status.vo.js";
import { CommissionError } from "../errors/atelier-error.js";
import type { DomainEvent } from "../events/domain-event.js";
import {
  commissionStarted,
  commissionCompleted,
  commissionFailed,
  commissionAborted,
} from "../events/commission-events.js";

export interface CommissionParams {
  readonly name: string;
  readonly description: string;
  readonly initialStroke: string;
  readonly maxStrokes: number;
  readonly strokeDefinitions: readonly StrokeDefinition[];
  readonly runId: string;
}

export class Commission {
  readonly name: string;
  readonly description: string;
  readonly initialStroke: string;
  readonly maxStrokes: number;
  readonly strokes: readonly Stroke[];
  readonly canvas: Canvas;
  readonly runId: string;

  private _status: CommissionStatus;
  private _currentStrokeName: string | null;
  private _executedStrokeCount: number;
  private readonly _domainEvents: DomainEvent[] = [];

  constructor(params: CommissionParams) {
    if (!params.name.trim()) {
      throw new CommissionError(params.name, "Commission name must not be empty");
    }
    if (params.strokeDefinitions.length === 0) {
      throw new CommissionError(params.name, "Commission must have at least one stroke");
    }
    const strokeNames = new Set(params.strokeDefinitions.map((s) => s.name));
    if (!strokeNames.has(params.initialStroke)) {
      throw new CommissionError(
        params.name,
        `Initial stroke "${params.initialStroke}" not found in stroke definitions`,
      );
    }

    this.name = params.name;
    this.description = params.description;
    this.initialStroke = params.initialStroke;
    this.maxStrokes = params.maxStrokes;
    this.runId = params.runId;
    this.strokes = Object.freeze(
      params.strokeDefinitions.map((def) => new Stroke(def)),
    );
    this.canvas = new Canvas();
    this._status = CommissionStatus.Draft;
    this._currentStrokeName = null;
    this._executedStrokeCount = 0;
  }

  get status(): CommissionStatus {
    return this._status;
  }

  get currentStrokeName(): string | null {
    return this._currentStrokeName;
  }

  get executedStrokeCount(): number {
    return this._executedStrokeCount;
  }

  get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }

  getStroke(name: string): Stroke {
    const stroke = this.strokes.find((s) => s.name === name);
    if (!stroke) {
      throw new CommissionError(this.name, `Stroke "${name}" not found`);
    }
    return stroke;
  }

  get currentStroke(): Stroke | null {
    return this._currentStrokeName
      ? this.getStroke(this._currentStrokeName)
      : null;
  }

  start(): void {
    this.transitionTo(CommissionStatus.Running);
    this._currentStrokeName = this.initialStroke;
    this._domainEvents.push(commissionStarted(this.name, this.runId));
  }

  advanceToStroke(name: string): void {
    if (this._status !== CommissionStatus.Running) {
      throw new CommissionError(
        this.name,
        `Cannot advance stroke: commission is "${this._status}"`,
      );
    }
    // Validate target stroke exists
    this.getStroke(name);

    this._executedStrokeCount++;
    if (this._executedStrokeCount > this.maxStrokes) {
      throw new CommissionError(
        this.name,
        `Max strokes limit (${this.maxStrokes}) exceeded`,
      );
    }
    this._currentStrokeName = name;
  }

  complete(): void {
    if (this._status !== CommissionStatus.Running) {
      throw new CommissionError(
        this.name,
        `Cannot complete: commission is "${this._status}"`,
      );
    }
    this.transitionTo(CommissionStatus.Completed);
    this._currentStrokeName = null;
    this._domainEvents.push(commissionCompleted(this.name, this.runId));
  }

  fail(reason: string): void {
    if (this._status !== CommissionStatus.Running) {
      throw new CommissionError(
        this.name,
        `Cannot fail: commission is "${this._status}"`,
      );
    }
    this.transitionTo(CommissionStatus.Failed);
    this._currentStrokeName = null;
    this._domainEvents.push(commissionFailed(this.name, this.runId, reason));
  }

  abort(reason: string): void {
    if (this._status !== CommissionStatus.Running) {
      throw new CommissionError(
        this.name,
        `Cannot abort: commission is "${this._status}"`,
      );
    }
    this.transitionTo(CommissionStatus.Aborted);
    // Mark any pending strokes as skipped
    for (const stroke of this.strokes) {
      if (stroke.status === StrokeStatus.Pending) {
        stroke.transitionTo(StrokeStatus.Skipped);
      }
    }
    this._currentStrokeName = null;
    this._domainEvents.push(commissionAborted(this.name, this.runId, reason));
  }

  private transitionTo(newStatus: CommissionStatus): void {
    if (!isValidCommissionTransition(this._status, newStatus)) {
      throw new CommissionError(
        this.name,
        `Invalid commission transition: ${this._status} -> ${newStatus}`,
      );
    }
    this._status = newStatus;
  }
}
