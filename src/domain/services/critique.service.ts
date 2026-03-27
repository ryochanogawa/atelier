/**
 * CritiqueService Domain Service
 * レビュー/リトライ制御のドメインサービス。
 */

import {
  CritiqueVerdict,
  type CritiqueIssue,
} from "../value-objects/critique-verdict.vo.js";
import { type Critique, createCritique } from "../models/critique.model.js";

export interface CritiqueRule {
  readonly name: string;
  readonly description: string;
  evaluate(response: string, context: Record<string, unknown>): CritiqueIssue | null;
}

export class CritiqueService {
  /**
   * レスポンスをルールに基づいて評価し、Critiqueを返す。
   */
  evaluate(
    response: string,
    critiqueRules: readonly CritiqueRule[],
    context: Record<string, unknown>,
  ): Critique {
    const issues: CritiqueIssue[] = [];

    for (const rule of critiqueRules) {
      const issue = rule.evaluate(response, context);
      if (issue) {
        issues.push(issue);
      }
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    const hasWarnings = issues.some((i) => i.severity === "warning");

    let verdict: CritiqueVerdict;
    let feedback: string;

    if (hasErrors) {
      verdict = CritiqueVerdict.Rejected;
      feedback = `Rejected: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`;
    } else if (hasWarnings) {
      verdict = CritiqueVerdict.NeedsFix;
      feedback = `Needs fix: ${issues.filter((i) => i.severity === "warning").map((i) => i.message).join("; ")}`;
    } else {
      verdict = CritiqueVerdict.Approved;
      feedback = "All checks passed.";
    }

    return createCritique({ verdict, feedback, issues });
  }

  /**
   * リトライすべきか判定する。
   */
  shouldRetry(
    critique: Critique,
    retryCount: number,
    maxRetries: number,
  ): boolean {
    if (critique.verdict === CritiqueVerdict.Approved) {
      return false;
    }
    if (critique.verdict === CritiqueVerdict.Rejected) {
      return false;
    }
    // NeedsFix の場合のみリトライ対象
    return retryCount < maxRetries;
  }
}
