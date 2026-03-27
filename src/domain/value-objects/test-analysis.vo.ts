/**
 * Test Analysis Value Objects
 * テスト品質分析に関する型定義。
 */

import type { Requirement } from "./requirements.vo.js";

/** ファイル単位のカバレッジ情報 */
export interface FileCoverage {
  readonly filePath: string;
  readonly lineRate: number;
  readonly branchRate: number;
  readonly uncoveredLines: number[];
  readonly uncoveredBranches: number[];
  readonly functionsCovered: number;
  readonly functionsTotal: number;
}

/** カバレッジ分析結果 */
export interface CoverageAnalysis {
  readonly totalLineRate: number;
  readonly totalBranchRate: number;
  readonly totalFunctionRate: number;
  readonly files: FileCoverage[];
  readonly gaps: CoverageGap[];
  readonly timestamp: string;
}

/** カバレッジギャップ */
export interface CoverageGap {
  readonly filePath: string;
  readonly type: "function" | "branch" | "line";
  readonly location: string;
  readonly description: string;
  readonly severity: "high" | "medium" | "low";
}

/** テストケース提案 */
export interface TestSuggestion {
  readonly targetFile: string;
  readonly testDescription: string;
  readonly testType: "unit" | "integration" | "e2e";
  readonly priority: "high" | "medium" | "low";
  readonly rationale: string;
  readonly skeletonCode: string;
}

/** E2Eテストシナリオ */
export interface E2EScenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirementIds: string[];
  readonly steps: E2EStep[];
  readonly expectedResult: string;
}

/** E2Eテストステップ */
export interface E2EStep {
  readonly order: number;
  readonly action: string;
  readonly expected: string;
}
