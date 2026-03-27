/**
 * PolicyEvaluation Value Objects
 * ポリシー評価結果に関する値オブジェクト。
 */

import type { RiskAssessment, DiffAnalysis } from "./risk-assessment.vo.js";
import type { LinterResult } from "./linter-result.vo.js";

export interface PolicyContext {
  readonly riskAssessment: RiskAssessment;
  readonly diffAnalysis: DiffAnalysis;
  readonly linterResults: LinterResult[];
  readonly commissionName: string;
}

export interface PolicyEvaluation {
  readonly approved: boolean;
  readonly violations: PolicyViolation[];
  readonly autoApproved: boolean;
  readonly requiredApprovers: string[];
}

export interface PolicyViolation {
  readonly ruleName: string;
  readonly description: string;
  readonly severity: "error" | "warning";
}

export interface PolicyRule {
  readonly name: string;
  readonly description: string;
  readonly condition: PolicyCondition;
  readonly severity: "error" | "warning";
}

export interface PolicyCondition {
  readonly type: "max_risk_score" | "no_linter_errors" | "max_file_count" | "require_tests" | "no_security_files";
  readonly value?: number;
}

/**
 * PolicyEvaluation を生成する。
 */
export function createPolicyEvaluation(params: {
  approved: boolean;
  violations: PolicyViolation[];
  autoApproved: boolean;
  requiredApprovers: string[];
}): PolicyEvaluation {
  return Object.freeze({
    approved: params.approved,
    violations: Object.freeze([...params.violations]) as PolicyViolation[],
    autoApproved: params.autoApproved,
    requiredApprovers: Object.freeze([...params.requiredApprovers]) as string[],
  });
}
