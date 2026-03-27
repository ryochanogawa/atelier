/**
 * CritiqueVerdict Value Object
 * レビュー判定結果を表す。
 */

export const CritiqueVerdict = {
  Approved: "approved",
  NeedsFix: "needs_fix",
  Rejected: "rejected",
} as const;

export type CritiqueVerdict =
  (typeof CritiqueVerdict)[keyof typeof CritiqueVerdict];

export interface CritiqueIssue {
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly location?: string;
  readonly suggestion?: string;
}

export function createCritiqueIssue(params: {
  severity: CritiqueIssue["severity"];
  message: string;
  location?: string;
  suggestion?: string;
}): CritiqueIssue {
  if (!params.message.trim()) {
    throw new Error("CritiqueIssue message must not be empty");
  }
  return Object.freeze({ ...params });
}
