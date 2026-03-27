/**
 * Stroke Domain Events
 */

import type { DomainEvent } from "./domain-event.js";
import { createEventId } from "./domain-event.js";

export interface StrokeStartedPayload {
  readonly commissionName: string;
  readonly strokeName: string;
  readonly runId: string;
}

export interface StrokeCompletedPayload {
  readonly commissionName: string;
  readonly strokeName: string;
  readonly runId: string;
}

export interface StrokeFailedPayload {
  readonly commissionName: string;
  readonly strokeName: string;
  readonly runId: string;
  readonly reason: string;
}

export interface StrokeRetriedPayload {
  readonly commissionName: string;
  readonly strokeName: string;
  readonly runId: string;
  readonly retryCount: number;
  readonly reason: string;
}

export type StrokeStarted = DomainEvent<StrokeStartedPayload>;
export type StrokeCompleted = DomainEvent<StrokeCompletedPayload>;
export type StrokeFailed = DomainEvent<StrokeFailedPayload>;
export type StrokeRetried = DomainEvent<StrokeRetriedPayload>;

export function strokeStarted(
  commissionName: string,
  strokeName: string,
  runId: string,
): StrokeStarted {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "stroke.started",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, strokeName, runId }),
  });
}

export function strokeCompleted(
  commissionName: string,
  strokeName: string,
  runId: string,
): StrokeCompleted {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "stroke.completed",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, strokeName, runId }),
  });
}

export function strokeFailed(
  commissionName: string,
  strokeName: string,
  runId: string,
  reason: string,
): StrokeFailed {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "stroke.failed",
    timestamp: new Date(),
    payload: Object.freeze({ commissionName, strokeName, runId, reason }),
  });
}

export function strokeRetried(
  commissionName: string,
  strokeName: string,
  runId: string,
  retryCount: number,
  reason: string,
): StrokeRetried {
  return Object.freeze({
    eventId: createEventId(),
    eventType: "stroke.retried",
    timestamp: new Date(),
    payload: Object.freeze({
      commissionName,
      strokeName,
      runId,
      retryCount,
      reason,
    }),
  });
}
