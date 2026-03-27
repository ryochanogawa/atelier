/**
 * Commission Domain Events
 */

import type { DomainEvent } from "./domain-event.js";
import { createEventId } from "./domain-event.js";

export interface CommissionStartedPayload {
  readonly commissionName: string;
  readonly runId: string;
}

export interface CommissionCompletedPayload {
  readonly commissionName: string;
  readonly runId: string;
}

export interface CommissionFailedPayload {
  readonly commissionName: string;
  readonly runId: string;
  readonly reason: string;
}

export interface CommissionAbortedPayload {
  readonly commissionName: string;
  readonly runId: string;
  readonly reason: string;
}

export type CommissionStarted = DomainEvent<CommissionStartedPayload>;
export type CommissionCompleted = DomainEvent<CommissionCompletedPayload>;
export type CommissionFailed = DomainEvent<CommissionFailedPayload>;
export type CommissionAborted = DomainEvent<CommissionAbortedPayload>;

export function commissionStarted(
  commissionName: string,
  runId: string,
): CommissionStarted {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "commission.started",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, runId }),
  });
}

export function commissionCompleted(
  commissionName: string,
  runId: string,
): CommissionCompleted {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "commission.completed",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, runId }),
  });
}

export function commissionFailed(
  commissionName: string,
  runId: string,
  reason: string,
): CommissionFailed {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "commission.failed",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, runId, reason }),
  });
}

export function commissionAborted(
  commissionName: string,
  runId: string,
  reason: string,
): CommissionAborted {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "commission.aborted",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, runId, reason }),
  });
}
