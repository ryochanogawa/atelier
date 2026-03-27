/**
 * PolicyEngineService Domain Service
 * ポリシー評価エンジン。YAML定義のルールに基づいて合否判定を行う。
 */

import type {
  PolicyContext,
  PolicyEvaluation,
  PolicyViolation,
  PolicyRule,
  PolicyCondition,
} from "../value-objects/policy-evaluation.vo.js";
import { createPolicyEvaluation } from "../value-objects/policy-evaluation.vo.js";

/** デフォルトのポリシールール */
const DEFAULT_RULES: PolicyRule[] = [
  {
    name: "max-risk-score",
    description: "リスクスコアが閾値以下であること",
    condition: { type: "max_risk_score", value: 60 },
    severity: "error",
  },
  {
    name: "no-linter-errors",
    description: "Linterエラーがないこと",
    condition: { type: "no_linter_errors" },
    severity: "error",
  },
  {
    name: "max-file-count",
    description: "変更ファイル数が閾値以下であること",
    condition: { type: "max_file_count", value: 50 },
    severity: "warning",
  },
  {
    name: "require-tests",
    description: "ソース変更時にテスト変更が含まれること",
    condition: { type: "require_tests" },
    severity: "warning",
  },
  {
    name: "no-security-files",
    description: "セキュリティ関連の機密ファイルが含まれていないこと",
    condition: { type: "no_security_files" },
    severity: "error",
  },
];

/** セキュリティ関連ファイルのパターン */
const SECURITY_FILE_PATTERNS = [
  /\.env$/,
  /\.pem$/,
  /\.key$/,
  /credentials/i,
  /secrets?/i,
  /\.p12$/,
  /\.pfx$/,
];

export class PolicyEngineService {
  private readonly rules: PolicyRule[];

  constructor(rules?: PolicyRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  /**
   * ポリシーコンテキストを評価し、結果を返す。
   */
  evaluate(context: PolicyContext): PolicyEvaluation {
    const violations: PolicyViolation[] = [];

    for (const rule of this.rules) {
      const violation = this.evaluateRule(rule, context);
      if (violation) {
        violations.push(violation);
      }
    }

    const hasErrors = violations.some((v) => v.severity === "error");
    const approved = !hasErrors;
    const autoApproved =
      approved && context.riskAssessment.autoApprovable && violations.length === 0;

    // 自動承認でない場合、必要な承認者を決定
    const requiredApprovers: string[] = [];
    if (!autoApproved) {
      if (context.riskAssessment.level === "critical") {
        requiredApprovers.push("tech-lead", "security-reviewer");
      } else if (context.riskAssessment.level === "high") {
        requiredApprovers.push("tech-lead");
      } else if (!approved) {
        requiredApprovers.push("reviewer");
      }
    }

    return createPolicyEvaluation({
      approved,
      violations,
      autoApproved,
      requiredApprovers,
    });
  }

  /**
   * 個別ルールを評価する。違反があれば PolicyViolation を返す。
   */
  private evaluateRule(
    rule: PolicyRule,
    context: PolicyContext,
  ): PolicyViolation | null {
    const passed = this.checkCondition(rule.condition, context);
    if (passed) return null;

    return {
      ruleName: rule.name,
      description: rule.description,
      severity: rule.severity,
    };
  }

  /**
   * 条件を評価する。
   */
  private checkCondition(
    condition: PolicyCondition,
    context: PolicyContext,
  ): boolean {
    switch (condition.type) {
      case "max_risk_score":
        return context.riskAssessment.score <= (condition.value ?? 60);

      case "no_linter_errors":
        return !context.linterResults.some((r) => r.severity === "error");

      case "max_file_count":
        return context.diffAnalysis.totalFiles <= (condition.value ?? 50);

      case "require_tests": {
        const srcFiles = context.diffAnalysis.filesByCategory.src ?? [];
        const testFiles = context.diffAnalysis.filesByCategory.test ?? [];
        // ソース変更がなければ OK
        if (srcFiles.length === 0) return true;
        // テスト変更があれば OK
        return testFiles.length > 0;
      }

      case "no_security_files": {
        const allFiles = Object.values(context.diffAnalysis.filesByCategory).flat();
        return !allFiles.some((file) =>
          SECURITY_FILE_PATTERNS.some((pattern) => pattern.test(file)),
        );
      }

      default:
        return true;
    }
  }
}
