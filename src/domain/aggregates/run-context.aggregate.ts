/**
 * RunContext Aggregate
 * 実行コンテキスト。実行の状態と履歴を管理する。
 */

import { Canvas } from "../models/canvas.model.js";
import type { CommissionStatus } from "../value-objects/commission-status.vo.js";

export interface StrokeExecution {
  readonly strokeName: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly success: boolean;
  readonly retryCount: number;
  readonly response?: string;
  readonly error?: string;
}

export class RunContext {
  readonly runId: string;
  readonly commissionName: string;
  readonly startedAt: Date;
  readonly canvas: Canvas;
  readonly worktreePath: string | null;

  private _currentStroke: string | null;
  private _status: CommissionStatus;
  private readonly _strokeHistory: StrokeExecution[] = [];

  constructor(params: {
    runId: string;
    commissionName: string;
    canvas?: Canvas;
    worktreePath?: string;
    status: CommissionStatus;
  }) {
    this.runId = params.runId;
    this.commissionName = params.commissionName;
    this.startedAt = new Date();
    this.canvas = params.canvas ?? new Canvas();
    this.worktreePath = params.worktreePath ?? null;
    this._currentStroke = null;
    this._status = params.status;
  }

  get currentStroke(): string | null {
    return this._currentStroke;
  }

  set currentStroke(strokeName: string | null) {
    this._currentStroke = strokeName;
  }

  get status(): CommissionStatus {
    return this._status;
  }

  set status(newStatus: CommissionStatus) {
    this._status = newStatus;
  }

  get strokeHistory(): readonly StrokeExecution[] {
    return [...this._strokeHistory];
  }

  recordStrokeExecution(execution: StrokeExecution): void {
    this._strokeHistory.push(execution);
  }

  getCurrentExecution(): StrokeExecution | undefined {
    if (!this._currentStroke) return undefined;
    // Return the latest execution for the current stroke
    for (let i = this._strokeHistory.length - 1; i >= 0; i--) {
      if (this._strokeHistory[i].strokeName === this._currentStroke) {
        return this._strokeHistory[i];
      }
    }
    return undefined;
  }

  getRetryCount(strokeName: string): number {
    return this._strokeHistory.filter(
      (e) => e.strokeName === strokeName && !e.success,
    ).length;
  }
}
