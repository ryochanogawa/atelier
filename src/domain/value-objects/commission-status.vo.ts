/**
 * CommissionStatus Value Object
 * Commission（ワークフロー）のライフサイクル状態を表す。
 */

export const CommissionStatus = {
  Draft: "draft",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Aborted: "aborted",
} as const;

export type CommissionStatus =
  (typeof CommissionStatus)[keyof typeof CommissionStatus];

const VALID_TRANSITIONS: ReadonlyMap<
  CommissionStatus,
  readonly CommissionStatus[]
> = new Map([
  [CommissionStatus.Draft, [CommissionStatus.Running]],
  [
    CommissionStatus.Running,
    [
      CommissionStatus.Completed,
      CommissionStatus.Failed,
      CommissionStatus.Aborted,
    ],
  ],
  [CommissionStatus.Completed, []],
  [CommissionStatus.Failed, []],
  [CommissionStatus.Aborted, []],
]);

export function isValidCommissionTransition(
  from: CommissionStatus,
  to: CommissionStatus,
): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.includes(to);
}
