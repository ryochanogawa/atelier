/**
 * Transition Value Object
 * Stroke間の遷移条件を定義する。
 */

export type OnMaxRetriesAction = "fail" | "skip" | "continue";

export interface Transition {
  readonly condition: string;
  readonly next: string;
  readonly maxRetries: number;
  readonly onMaxRetries: OnMaxRetriesAction;
}

export function createTransition(params: {
  condition: string;
  next: string;
  maxRetries?: number;
  onMaxRetries?: OnMaxRetriesAction;
}): Transition {
  if (!params.next.trim()) {
    throw new Error("Transition target (next) must not be empty");
  }
  return Object.freeze({
    condition: params.condition,
    next: params.next,
    maxRetries: params.maxRetries ?? 3,
    onMaxRetries: params.onMaxRetries ?? "fail",
  });
}
