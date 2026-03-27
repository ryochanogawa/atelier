/**
 * RunResult DTO
 * Commission 実行結果のデータ転送オブジェクト。
 */

import type { CommissionStatus } from "../../domain/value-objects/commission-status.vo.js";

export interface RunResultDto {
  readonly runId: string;
  readonly commissionName: string;
  readonly status: CommissionStatus;
  readonly strokesExecuted: number;
  readonly strokesTotal: number;
  readonly duration: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly errors: readonly RunErrorDto[];
}

export interface RunErrorDto {
  readonly strokeName: string;
  readonly message: string;
  readonly timestamp: string;
}

export function createRunResultDto(params: {
  runId: string;
  commissionName: string;
  status: CommissionStatus;
  strokesExecuted: number;
  strokesTotal: number;
  duration: number;
  startedAt: string;
  completedAt: string;
  errors?: readonly RunErrorDto[];
}): RunResultDto {
  return Object.freeze({
    runId: params.runId,
    commissionName: params.commissionName,
    status: params.status,
    strokesExecuted: params.strokesExecuted,
    strokesTotal: params.strokesTotal,
    duration: params.duration,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    errors: Object.freeze([...(params.errors ?? [])]),
  });
}
