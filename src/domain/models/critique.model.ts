/**
 * Critique Model
 * レビュー結果を表す値オブジェクト。
 */

import type {
  CritiqueVerdict,
  CritiqueIssue,
} from "../value-objects/critique-verdict.vo.js";

export interface Critique {
  readonly verdict: CritiqueVerdict;
  readonly feedback: string;
  readonly issues: readonly CritiqueIssue[];
  readonly retryCount: number;
}

export function createCritique(params: {
  verdict: CritiqueVerdict;
  feedback: string;
  issues?: readonly CritiqueIssue[];
  retryCount?: number;
}): Critique {
  return Object.freeze({
    verdict: params.verdict,
    feedback: params.feedback,
    issues: Object.freeze([...(params.issues ?? [])]),
    retryCount: params.retryCount ?? 0,
  });
}
