import { describe, it, expect } from "vitest";
import { DiffAnalyzerService } from "../../../src/domain/services/diff-analyzer.service.js";

describe("DiffAnalyzerService", () => {
  const service = new DiffAnalyzerService();

  const sampleDiff = `diff --git a/src/app/main.ts b/src/app/main.ts
--- a/src/app/main.ts
+++ b/src/app/main.ts
@@ -1,5 +1,7 @@
+import { foo } from './foo';
+import { bar } from './bar';
 export function main() {
-  console.log("old");
+  console.log("new");
+  foo();
 }
diff --git a/tests/main.test.ts b/tests/main.test.ts
--- a/tests/main.test.ts
+++ b/tests/main.test.ts
@@ -1,3 +1,5 @@
+import { describe, it } from 'vitest';
 describe('main', () => {
+  it('should work', () => {});
 });`;

  describe("analyzeDiff", () => {
    it("diffテキストからファイル数・追加・削除を解析する", () => {
      const analysis = service.analyzeDiff(sampleDiff);

      expect(analysis.totalFiles).toBe(2);
      expect(analysis.additions).toBeGreaterThan(0);
      expect(analysis.deletions).toBeGreaterThan(0);
    });

    it("ファイルをカテゴリに分類する", () => {
      const analysis = service.analyzeDiff(sampleDiff);

      expect(analysis.filesByCategory.src).toContain("src/app/main.ts");
      expect(analysis.filesByCategory.test).toContain("tests/main.test.ts");
    });

    it("complexityScoreを計算する", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      expect(analysis.complexityScore).toBeGreaterThan(0);
    });

    it("空のdiffで空の結果を返す", () => {
      const analysis = service.analyzeDiff("");

      expect(analysis.totalFiles).toBe(0);
      expect(analysis.additions).toBe(0);
      expect(analysis.deletions).toBe(0);
    });

    it("設定ファイルを正しく分類する", () => {
      const configDiff = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
+  "new-dep": "1.0.0"
`;
      const analysis = service.analyzeDiff(configDiff);
      expect(analysis.filesByCategory.config).toContain("package.json");
    });

    it("CI/CDファイルを正しく分類する", () => {
      const ciDiff = `diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,2 +1,3 @@
+  new-step:
`;
      const analysis = service.analyzeDiff(ciDiff);
      expect(analysis.filesByCategory.ci).toContain(".github/workflows/ci.yml");
    });
  });

  describe("calculateRiskScore", () => {
    it("少量の変更では低リスク", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      const risk = service.calculateRiskScore(analysis);

      expect(risk.score).toBeLessThan(50);
    });

    it("テスト不足を検出する", () => {
      const srcOnlyDiff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1,2 @@
+new line
`;
      const analysis = service.analyzeDiff(srcOnlyDiff);
      const risk = service.calculateRiskScore(analysis);

      const missingTestFactor = risk.factors.find(
        (f) => f.category === "missing_tests",
      );
      expect(missingTestFactor).toBeDefined();
    });

    it("設定ファイル変更を検出する", () => {
      const configDiff = `diff --git a/tsconfig.json b/tsconfig.json
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -1 +1,2 @@
+  "strict": true
`;
      const analysis = service.analyzeDiff(configDiff);
      const risk = service.calculateRiskScore(analysis);

      const configFactor = risk.factors.find(
        (f) => f.category === "config_change",
      );
      expect(configFactor).toBeDefined();
    });

    it("CI/CD変更を検出する", () => {
      const ciDiff = `diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -1 +1,2 @@
+  deploy-step:
`;
      const analysis = service.analyzeDiff(ciDiff);
      const risk = service.calculateRiskScore(analysis);

      const ciFactor = risk.factors.find((f) => f.category === "ci_change");
      expect(ciFactor).toBeDefined();
    });
  });

  describe("generateImpactSummary", () => {
    it("影響コンポーネントを特定する", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      const summary = service.generateImpactSummary(analysis);

      expect(summary.affectedComponents.length).toBeGreaterThan(0);
    });

    it("レビュー範囲を推奨する", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      const summary = service.generateImpactSummary(analysis);

      expect(summary.suggestedReviewScope.length).toBeGreaterThan(0);
    });

    it("テスト範囲を推奨する", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      const summary = service.generateImpactSummary(analysis);

      expect(summary.suggestedTestScope.length).toBeGreaterThan(0);
      expect(summary.suggestedTestScope.some((t) => t.includes(".test.ts"))).toBe(true);
    });

    it("サマリーテキストを生成する", () => {
      const analysis = service.analyzeDiff(sampleDiff);
      const summary = service.generateImpactSummary(analysis);

      expect(summary.summary).toContain("ファイルが変更されました");
    });

    it("空のsrcファイルでは空のテスト範囲", () => {
      const docsDiff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
+new docs
`;
      const analysis = service.analyzeDiff(docsDiff);
      const summary = service.generateImpactSummary(analysis);

      expect(summary.suggestedTestScope).toHaveLength(0);
    });
  });
});
