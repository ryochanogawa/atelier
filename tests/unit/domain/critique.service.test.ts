import { describe, it, expect } from "vitest";
import { CritiqueService, type CritiqueRule } from "../../../src/domain/services/critique.service.js";
import { CritiqueVerdict, type CritiqueIssue } from "../../../src/domain/value-objects/critique-verdict.vo.js";
import { createCritique } from "../../../src/domain/models/critique.model.js";

// ---- Mock helpers ----

function makeRule(issue: CritiqueIssue | null, name = "mock-rule"): CritiqueRule {
  return {
    name,
    description: `Mock rule: ${name}`,
    evaluate: (_response, _context) => issue,
  };
}

const ERROR_ISSUE: CritiqueIssue = { severity: "error", message: "Something is broken" };
const WARNING_ISSUE: CritiqueIssue = { severity: "warning", message: "Something needs attention" };

const service = new CritiqueService();

// ---- evaluate() ----

describe("CritiqueService.evaluate()", () => {
  it("全てのルールがnullを返す場合 → Approved", () => {
    const rules = [makeRule(null, "rule-1"), makeRule(null, "rule-2")];
    const result = service.evaluate("response text", rules, {});

    expect(result.verdict).toBe(CritiqueVerdict.Approved);
    expect(result.feedback).toBe("All checks passed.");
    expect(result.issues).toHaveLength(0);
  });

  it("warningのissueのみ → NeedsFix", () => {
    const rules = [makeRule(WARNING_ISSUE, "rule-warn"), makeRule(null, "rule-ok")];
    const result = service.evaluate("response text", rules, {});

    expect(result.verdict).toBe(CritiqueVerdict.NeedsFix);
    expect(result.feedback).toContain("Needs fix");
    expect(result.feedback).toContain("Something needs attention");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe("warning");
  });

  it("errorのissueあり → Rejected", () => {
    const rules = [makeRule(ERROR_ISSUE, "rule-error")];
    const result = service.evaluate("response text", rules, {});

    expect(result.verdict).toBe(CritiqueVerdict.Rejected);
    expect(result.feedback).toContain("Rejected");
    expect(result.feedback).toContain("Something is broken");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe("error");
  });

  it("error + warning が混在する場合 → Rejected（errorが優先）", () => {
    const rules = [
      makeRule(ERROR_ISSUE, "rule-error"),
      makeRule(WARNING_ISSUE, "rule-warn"),
    ];
    const result = service.evaluate("response text", rules, {});

    expect(result.verdict).toBe(CritiqueVerdict.Rejected);
    expect(result.feedback).toContain("Rejected");
    expect(result.issues).toHaveLength(2);
  });
});

// ---- shouldRetry() ----

describe("CritiqueService.shouldRetry()", () => {
  it("Approved の場合 → false", () => {
    const critique = createCritique({ verdict: CritiqueVerdict.Approved, feedback: "ok" });
    expect(service.shouldRetry(critique, 0, 3)).toBe(false);
  });

  it("Rejected の場合 → false", () => {
    const critique = createCritique({ verdict: CritiqueVerdict.Rejected, feedback: "rejected" });
    expect(service.shouldRetry(critique, 0, 3)).toBe(false);
  });

  it("NeedsFix + リトライ残あり → true", () => {
    const critique = createCritique({ verdict: CritiqueVerdict.NeedsFix, feedback: "needs fix" });
    expect(service.shouldRetry(critique, 1, 3)).toBe(true);
  });

  it("NeedsFix + リトライ上限到達 → false", () => {
    const critique = createCritique({ verdict: CritiqueVerdict.NeedsFix, feedback: "needs fix" });
    expect(service.shouldRetry(critique, 3, 3)).toBe(false);
  });
});
