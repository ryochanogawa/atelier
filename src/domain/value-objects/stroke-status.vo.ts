/**
 * StrokeStatus Value Object
 * Stroke（実行ステップ）のライフサイクル状態を表す。
 */

export const StrokeStatus = {
  Pending: "pending",
  Composing: "composing",
  Executing: "executing",
  Critiquing: "critiquing",
  Retouching: "retouching",
  Completed: "completed",
  Failed: "failed",
  Skipped: "skipped",
} as const;

export type StrokeStatus = (typeof StrokeStatus)[keyof typeof StrokeStatus];

const VALID_TRANSITIONS: ReadonlyMap<StrokeStatus, readonly StrokeStatus[]> =
  new Map([
    [StrokeStatus.Pending, [StrokeStatus.Composing, StrokeStatus.Skipped]],
    [StrokeStatus.Composing, [StrokeStatus.Executing, StrokeStatus.Failed]],
    [
      StrokeStatus.Executing,
      [StrokeStatus.Critiquing, StrokeStatus.Completed, StrokeStatus.Failed],
    ],
    [
      StrokeStatus.Critiquing,
      [StrokeStatus.Completed, StrokeStatus.Retouching, StrokeStatus.Failed],
    ],
    [
      StrokeStatus.Retouching,
      [StrokeStatus.Executing, StrokeStatus.Failed],
    ],
    [StrokeStatus.Completed, []],
    [StrokeStatus.Failed, []],
    [StrokeStatus.Skipped, []],
  ]);

export function isValidStrokeTransition(
  from: StrokeStatus,
  to: StrokeStatus,
): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.includes(to);
}
