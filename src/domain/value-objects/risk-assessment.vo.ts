/**
 * RiskAssessment Value Objects
 * 差分解析・リスクスコアリングに関する値オブジェクト。
 */

export interface RiskAssessment {
  readonly score: number; // 0-100
  readonly level: "low" | "medium" | "high" | "critical";
  readonly factors: RiskFactor[];
  readonly autoApprovable: boolean; // low リスクなら true
}

export interface RiskFactor {
  readonly category: string;
  readonly description: string;
  readonly weight: number;
}

export interface DiffAnalysis {
  readonly totalFiles: number;
  readonly additions: number;
  readonly deletions: number;
  readonly filesByCategory: Record<string, string[]>;
  readonly complexityScore: number;
}

export interface ImpactSummary {
  readonly affectedComponents: string[];
  readonly suggestedReviewScope: string[];
  readonly suggestedTestScope: string[];
  readonly summary: string;
}

/**
 * リスクレベルをスコアから判定する。
 */
export function determineRiskLevel(
  score: number,
): RiskAssessment["level"] {
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  if (score <= 80) return "high";
  return "critical";
}

/**
 * RiskAssessment を生成する。
 */
export function createRiskAssessment(params: {
  score: number;
  factors: RiskFactor[];
}): RiskAssessment {
  const clampedScore = Math.max(0, Math.min(100, Math.round(params.score)));
  const level = determineRiskLevel(clampedScore);
  return Object.freeze({
    score: clampedScore,
    level,
    factors: Object.freeze([...params.factors]) as RiskFactor[],
    autoApprovable: level === "low",
  });
}

/**
 * DiffAnalysis を生成する。
 */
export function createDiffAnalysis(params: {
  totalFiles: number;
  additions: number;
  deletions: number;
  filesByCategory: Record<string, string[]>;
  complexityScore: number;
}): DiffAnalysis {
  return Object.freeze({
    totalFiles: params.totalFiles,
    additions: params.additions,
    deletions: params.deletions,
    filesByCategory: Object.freeze(
      Object.fromEntries(
        Object.entries(params.filesByCategory).map(([k, v]) => [
          k,
          Object.freeze([...v]),
        ]),
      ),
    ) as Record<string, string[]>,
    complexityScore: params.complexityScore,
  });
}
