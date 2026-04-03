/**
 * 7.2 Conductor + Critique 連携テスト
 * 7.3 並列stroke + AggregateEvaluator テスト
 *
 * ConductorService, CritiqueService, AggregateEvaluator を組み合わせた統合テスト。
 * モックは Medium（subprocess）のみ。
 */
import { describe, it, expect, vi } from "vitest";
import { runConductor, type ConductorConfig } from "../../../src/application/services/conductor.service.js";
import { CritiqueService } from "../../../src/domain/services/critique.service.js";
import { AggregateEvaluator } from "../../../src/domain/services/aggregate-evaluator.service.js";
import { parseStatusTag } from "../../../src/domain/services/conductor-parser.js";
import { createCritique } from "../../../src/domain/models/critique.model.js";
import { CritiqueVerdict } from "../../../src/domain/value-objects/critique-verdict.vo.js";
import type { MediumExecutor } from "../../../src/application/ports/medium-executor.port.js";

// --- helpers ---

/**
 * MediumExecutor モックを作成する。
 * AI レスポンスとして返す文字列を指定する。
 */
function createMockMediumExecutor(aiResponse: string): MediumExecutor {
  return {
    async execute() {
      return {
        content: aiResponse,
        exitCode: 0,
        durationMs: 100,
        rawStdout: aiResponse,
        rawStderr: "",
      };
    },
    listMedia() {
      return ["claude-code"];
    },
  };
}

// ファイルシステム系もモック（palette 読み込み回避）
vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  readTextFile: vi.fn().mockResolvedValue(""),
  fileExists: vi.fn().mockResolvedValue(false),
}));

// ビルトインパレットパスのモック
vi.mock("../../../src/builtin/index.js", () => ({
  getBuiltinPalettePath: vi.fn().mockReturnValue("/nonexistent/conductor.yaml"),
}));

// --- テスト開始 ---

describe("7.2 Conductor + Critique 連携", () => {
  const critiqueService = new CritiqueService();

  const conductorRules: ConductorConfig["rules"] = [
    { condition: "approved", next: null },
    { condition: "needs_fix", next: "fix-stroke" },
    { condition: "rejected", next: null },
  ];

  const conductorConfig: ConductorConfig = { rules: conductorRules };

  // 1. approved -> 次strokeへ: runConductor approved -> CritiqueService.shouldRetry() = false
  it("approved -> CritiqueService.shouldRetry() は false を返す", async () => {
    const aiResponse = "結果は問題ありません。[STATUS: approved]";

    const executor = createMockMediumExecutor(aiResponse);
    const result = await runConductor(
      "stroke output text",
      conductorConfig,
      executor,
      "claude-code",
      "/tmp",
      "/tmp/project",
    );

    expect(result.status).toBe("approved");
    expect(result.nextStroke).toBeNull(); // approved -> next: null (完了)

    // CritiqueService との連携: approved の Critique を作成し shouldRetry を確認
    const critique = createCritique({
      verdict: CritiqueVerdict.Approved,
      feedback: "All checks passed.",
    });
    const shouldRetry = critiqueService.shouldRetry(critique, 0, 3);
    expect(shouldRetry).toBe(false);
  });

  // 2. needs_fix -> リトライ: shouldRetry(retries=0, max=3) = true
  it("needs_fix -> shouldRetry(retries=0, max=3) は true を返す", async () => {
    const aiResponse = "修正が必要です。[STATUS: needs_fix]";

    const executor = createMockMediumExecutor(aiResponse);
    const result = await runConductor(
      "stroke output text",
      conductorConfig,
      executor,
      "claude-code",
      "/tmp",
      "/tmp/project",
    );

    expect(result.status).toBe("needs_fix");
    expect(result.nextStroke).toBe("fix-stroke");

    // CritiqueService: NeedsFix でリトライ可能
    const critique = createCritique({
      verdict: CritiqueVerdict.NeedsFix,
      feedback: "Needs fix: some warning.",
      issues: [{ severity: "warning", message: "some warning" }],
    });
    const shouldRetry = critiqueService.shouldRetry(critique, 0, 3);
    expect(shouldRetry).toBe(true);
  });

  // 3. needs_fix -> リトライ上限: shouldRetry(retries=3, max=3) = false
  it("needs_fix -> shouldRetry(retries=3, max=3) は false を返す", () => {
    const critique = createCritique({
      verdict: CritiqueVerdict.NeedsFix,
      feedback: "Needs fix: still has warnings.",
      issues: [{ severity: "warning", message: "persistent warning" }],
    });
    const shouldRetry = critiqueService.shouldRetry(critique, 3, 3);
    expect(shouldRetry).toBe(false);
  });

  // 4. rejected -> リトライしない: shouldRetry = false
  it("rejected -> shouldRetry は false を返す", async () => {
    const aiResponse = "致命的な問題があります。[STATUS: rejected]";

    const executor = createMockMediumExecutor(aiResponse);
    const result = await runConductor(
      "stroke output text",
      conductorConfig,
      executor,
      "claude-code",
      "/tmp",
      "/tmp/project",
    );

    expect(result.status).toBe("rejected");
    expect(result.nextStroke).toBeNull(); // rejected -> next: null

    const critique = createCritique({
      verdict: CritiqueVerdict.Rejected,
      feedback: "Rejected: critical error.",
      issues: [{ severity: "error", message: "critical error" }],
    });
    const shouldRetry = critiqueService.shouldRetry(critique, 0, 3);
    expect(shouldRetry).toBe(false);
  });
});

describe("7.3 並列stroke + AggregateEvaluator", () => {
  const evaluator = new AggregateEvaluator();
  const critiqueService = new CritiqueService();

  // 5. all("approved"): 全サブストローク approved -> true -> 次strokeへ
  it('all("approved") - 全サブストローク approved -> true', () => {
    const subResults = new Map<string, string>([
      ["sub-1", "approved"],
      ["sub-2", "approved"],
      ["sub-3", "approved"],
    ]);

    const result = evaluator.evaluate('all("approved")', subResults);
    expect(result).toBe(true);

    // approved なので次の stroke へ進む（リトライしない）
    const critique = createCritique({
      verdict: CritiqueVerdict.Approved,
      feedback: "All checks passed.",
    });
    expect(critiqueService.shouldRetry(critique, 0, 3)).toBe(false);
  });

  // 6. any("needs_fix"): 一部 needs_fix -> true -> 再実行
  it('any("needs_fix") - 一部 needs_fix -> true', () => {
    const subResults = new Map<string, string>([
      ["sub-1", "approved"],
      ["sub-2", "needs_fix"],
      ["sub-3", "approved"],
    ]);

    const result = evaluator.evaluate('any("needs_fix")', subResults);
    expect(result).toBe(true);

    // needs_fix があるので再実行（リトライ）
    const critique = createCritique({
      verdict: CritiqueVerdict.NeedsFix,
      feedback: "Needs fix: sub-2 failed.",
      issues: [{ severity: "warning", message: "sub-2 failed" }],
    });
    expect(critiqueService.shouldRetry(critique, 0, 3)).toBe(true);
  });

  // 7. all("approved") 一部NG: 一つ needs_fix -> false
  it('all("approved") - 一つ needs_fix -> false', () => {
    const subResults = new Map<string, string>([
      ["sub-1", "approved"],
      ["sub-2", "needs_fix"],
      ["sub-3", "approved"],
    ]);

    const result = evaluator.evaluate('all("approved")', subResults);
    expect(result).toBe(false);
  });

  // 8. 組み合わせ: all("approved")=false かつ any("needs_fix")=true の場合のフロー
  it('all("approved")=false かつ any("needs_fix")=true の組み合わせフロー', () => {
    const subResults = new Map<string, string>([
      ["sub-1", "approved"],
      ["sub-2", "needs_fix"],
      ["sub-3", "approved"],
    ]);

    // all("approved") は false（全て approved ではない）
    const allApproved = evaluator.evaluate('all("approved")', subResults);
    expect(allApproved).toBe(false);

    // any("needs_fix") は true（一つ以上 needs_fix がある）
    const anyNeedsFix = evaluator.evaluate('any("needs_fix")', subResults);
    expect(anyNeedsFix).toBe(true);

    // フロー判定: all("approved") が false なので完了ではない
    // any("needs_fix") が true なのでリトライ対象
    // -> CritiqueService で NeedsFix として扱い、リトライ判定
    const critique = createCritique({
      verdict: CritiqueVerdict.NeedsFix,
      feedback: "Needs fix: partial failure in parallel strokes.",
      issues: [{ severity: "warning", message: "sub-2 needs fix" }],
    });

    // リトライ回数0、上限3 -> リトライする
    expect(critiqueService.shouldRetry(critique, 0, 3)).toBe(true);

    // リトライ回数が上限に達した場合 -> リトライしない
    expect(critiqueService.shouldRetry(critique, 3, 3)).toBe(false);
  });
});
