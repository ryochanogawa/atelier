/**
 * TestAnalyzer Domain Service
 * テストカバレッジ分析とテストケース提案。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CoverageAnalysis,
  FileCoverage,
  CoverageGap,
  TestSuggestion,
  E2EScenario,
  E2EStep,
} from "../value-objects/test-analysis.vo.js";
import type { Requirement } from "../value-objects/requirements.vo.js";

export class TestAnalyzerService {
  /**
   * カバレッジレポートをパースして分析結果を返す。
   * lcov 形式と JSON（istanbul/c8）形式に対応。
   */
  async analyzeCoverage(workingDir: string): Promise<CoverageAnalysis> {
    // JSON カバレッジファイルの探索
    const jsonPaths = [
      join(workingDir, "coverage", "coverage-summary.json"),
      join(workingDir, "coverage", "coverage-final.json"),
    ];

    for (const jsonPath of jsonPaths) {
      try {
        const content = await readFile(jsonPath, "utf-8");
        return this.parseJsonCoverage(content);
      } catch {
        // ファイルが見つからない場合は次を試行
      }
    }

    // LCOV ファイルの探索
    const lcovPaths = [
      join(workingDir, "coverage", "lcov.info"),
      join(workingDir, "lcov.info"),
    ];

    for (const lcovPath of lcovPaths) {
      try {
        const content = await readFile(lcovPath, "utf-8");
        return this.parseLcov(content);
      } catch {
        // ファイルが見つからない場合は次を試行
      }
    }

    throw new Error(
      "カバレッジレポートが見つかりません。coverage/ ディレクトリにcoverage-summary.json または lcov.info を配置してください。",
    );
  }

  /**
   * カバレッジギャップに基づいてテストケースを提案する。
   */
  suggestTests(
    coverageGaps: CoverageGap[],
    sourceCode: string,
  ): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    for (const gap of coverageGaps) {
      const suggestion = this.createTestSuggestion(gap, sourceCode);
      suggestions.push(suggestion);
    }

    // 優先度でソート
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );

    return suggestions;
  }

  /**
   * 要件からE2Eテストシナリオを生成する。
   */
  generateE2EScenarios(requirements: Requirement[]): E2EScenario[] {
    const scenarios: E2EScenario[] = [];
    let scenarioNum = 1;

    // 機能要件（feature）から正常系シナリオを生成
    const featureReqs = requirements.filter((r) => r.category === "feature");
    for (const req of featureReqs) {
      const steps = this.generateStepsFromRequirement(req);
      scenarios.push({
        id: `E2E-${String(scenarioNum++).padStart(3, "0")}`,
        title: `正常系: ${req.description.slice(0, 50)}`,
        description: `要件「${req.id}」の正常系フローを検証する。`,
        requirementIds: [req.id],
        steps,
        expectedResult: req.acceptanceCriteria[0] ?? "要件通りに動作すること",
      });
    }

    // セキュリティ要件から異常系シナリオを生成
    const securityReqs = requirements.filter(
      (r) => r.category === "security",
    );
    for (const req of securityReqs) {
      scenarios.push({
        id: `E2E-${String(scenarioNum++).padStart(3, "0")}`,
        title: `セキュリティ: ${req.description.slice(0, 50)}`,
        description: `要件「${req.id}」のセキュリティ要件を検証する。`,
        requirementIds: [req.id],
        steps: [
          {
            order: 1,
            action: "不正な入力・操作を試行する",
            expected: "適切にブロックされること",
          },
          {
            order: 2,
            action: "権限のない操作を試行する",
            expected: "アクセスが拒否されること",
          },
          {
            order: 3,
            action: "エラーメッセージを確認する",
            expected: "内部情報が漏洩していないこと",
          },
        ],
        expectedResult: "セキュリティ要件が満たされていること",
      });
    }

    // パフォーマンス要件からシナリオを生成
    const perfReqs = requirements.filter(
      (r) => r.category === "performance",
    );
    for (const req of perfReqs) {
      scenarios.push({
        id: `E2E-${String(scenarioNum++).padStart(3, "0")}`,
        title: `パフォーマンス: ${req.description.slice(0, 50)}`,
        description: `要件「${req.id}」のパフォーマンス要件を検証する。`,
        requirementIds: [req.id],
        steps: [
          {
            order: 1,
            action: "通常負荷で処理を実行する",
            expected: "応答時間が目標値以内であること",
          },
          {
            order: 2,
            action: "高負荷条件下で処理を実行する",
            expected: "性能劣化が許容範囲内であること",
          },
        ],
        expectedResult: "パフォーマンス目標を達成していること",
      });
    }

    return scenarios;
  }

  // --- private helpers ---

  private parseJsonCoverage(content: string): CoverageAnalysis {
    const data = JSON.parse(content) as Record<string, unknown>;
    const files: FileCoverage[] = [];
    const gaps: CoverageGap[] = [];

    // coverage-summary.json 形式
    if ("total" in data) {
      const summary = data as Record<
        string,
        {
          lines?: { pct: number };
          branches?: { pct: number };
          functions?: { pct: number; covered?: number; total?: number };
          statements?: { pct: number };
        }
      >;

      for (const [filePath, metrics] of Object.entries(summary)) {
        if (filePath === "total") continue;

        const lineRate = (metrics.lines?.pct ?? 0) / 100;
        const branchRate = (metrics.branches?.pct ?? 0) / 100;
        const funcCovered = metrics.functions?.covered ?? 0;
        const funcTotal = metrics.functions?.total ?? 0;

        const fileCov: FileCoverage = {
          filePath,
          lineRate,
          branchRate,
          uncoveredLines: [],
          uncoveredBranches: [],
          functionsCovered: funcCovered,
          functionsTotal: funcTotal,
        };

        files.push(fileCov);

        // ギャップの検出
        if (lineRate < 0.8) {
          gaps.push({
            filePath,
            type: "line",
            location: filePath,
            description: `行カバレッジが${Math.round(lineRate * 100)}%です（目標: 80%以上）`,
            severity: lineRate < 0.5 ? "high" : "medium",
          });
        }
        if (branchRate < 0.7) {
          gaps.push({
            filePath,
            type: "branch",
            location: filePath,
            description: `ブランチカバレッジが${Math.round(branchRate * 100)}%です（目標: 70%以上）`,
            severity: branchRate < 0.4 ? "high" : "medium",
          });
        }
        if (funcTotal > 0 && funcCovered < funcTotal) {
          gaps.push({
            filePath,
            type: "function",
            location: filePath,
            description: `${funcTotal - funcCovered}個の関数がテストされていません`,
            severity: funcTotal - funcCovered > 3 ? "high" : "medium",
          });
        }
      }

      const total = summary["total"];
      return {
        totalLineRate: (total?.lines?.pct ?? 0) / 100,
        totalBranchRate: (total?.branches?.pct ?? 0) / 100,
        totalFunctionRate: (total?.functions?.pct ?? 0) / 100,
        files,
        gaps,
        timestamp: new Date().toISOString(),
      };
    }

    // coverage-final.json 形式（基本的な解析）
    return {
      totalLineRate: 0,
      totalBranchRate: 0,
      totalFunctionRate: 0,
      files,
      gaps,
      timestamp: new Date().toISOString(),
    };
  }

  private parseLcov(content: string): CoverageAnalysis {
    const files: FileCoverage[] = [];
    const gaps: CoverageGap[] = [];
    const blocks = content.split("end_of_record").filter((b) => b.trim());

    let totalLinesHit = 0;
    let totalLinesFound = 0;
    let totalBranchesHit = 0;
    let totalBranchesFound = 0;
    let totalFunctionsHit = 0;
    let totalFunctionsFound = 0;

    for (const block of blocks) {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l);

      let filePath = "";
      let linesHit = 0;
      let linesFound = 0;
      let branchesHit = 0;
      let branchesFound = 0;
      let functionsHit = 0;
      let functionsFound = 0;
      const uncoveredLines: number[] = [];
      const uncoveredBranches: number[] = [];

      for (const line of lines) {
        if (line.startsWith("SF:")) {
          filePath = line.slice(3);
        } else if (line.startsWith("LH:")) {
          linesHit = parseInt(line.slice(3), 10);
        } else if (line.startsWith("LF:")) {
          linesFound = parseInt(line.slice(3), 10);
        } else if (line.startsWith("BRH:")) {
          branchesHit = parseInt(line.slice(4), 10);
        } else if (line.startsWith("BRF:")) {
          branchesFound = parseInt(line.slice(4), 10);
        } else if (line.startsWith("FNH:")) {
          functionsHit = parseInt(line.slice(4), 10);
        } else if (line.startsWith("FNF:")) {
          functionsFound = parseInt(line.slice(4), 10);
        } else if (line.startsWith("DA:")) {
          const parts = line.slice(3).split(",");
          const lineNum = parseInt(parts[0], 10);
          const hitCount = parseInt(parts[1], 10);
          if (hitCount === 0) uncoveredLines.push(lineNum);
        } else if (line.startsWith("BRDA:")) {
          const parts = line.slice(5).split(",");
          const lineNum = parseInt(parts[0], 10);
          const taken = parts[3];
          if (taken === "-" || taken === "0") {
            uncoveredBranches.push(lineNum);
          }
        }
      }

      if (!filePath) continue;

      const lineRate = linesFound === 0 ? 1 : linesHit / linesFound;
      const branchRate =
        branchesFound === 0 ? 1 : branchesHit / branchesFound;

      files.push({
        filePath,
        lineRate,
        branchRate,
        uncoveredLines,
        uncoveredBranches,
        functionsCovered: functionsHit,
        functionsTotal: functionsFound,
      });

      totalLinesHit += linesHit;
      totalLinesFound += linesFound;
      totalBranchesHit += branchesHit;
      totalBranchesFound += branchesFound;
      totalFunctionsHit += functionsHit;
      totalFunctionsFound += functionsFound;

      // ギャップ検出
      if (lineRate < 0.8) {
        gaps.push({
          filePath,
          type: "line",
          location: filePath,
          description: `行カバレッジが${Math.round(lineRate * 100)}%です（目標: 80%以上）`,
          severity: lineRate < 0.5 ? "high" : "medium",
        });
      }
      if (branchRate < 0.7 && branchesFound > 0) {
        gaps.push({
          filePath,
          type: "branch",
          location: filePath,
          description: `ブランチカバレッジが${Math.round(branchRate * 100)}%です（目標: 70%以上）`,
          severity: branchRate < 0.4 ? "high" : "medium",
        });
      }
      if (functionsFound > 0 && functionsHit < functionsFound) {
        gaps.push({
          filePath,
          type: "function",
          location: filePath,
          description: `${functionsFound - functionsHit}個の関数がテストされていません`,
          severity:
            functionsFound - functionsHit > 3 ? "high" : "medium",
        });
      }
    }

    return {
      totalLineRate:
        totalLinesFound === 0 ? 0 : totalLinesHit / totalLinesFound,
      totalBranchRate:
        totalBranchesFound === 0
          ? 0
          : totalBranchesHit / totalBranchesFound,
      totalFunctionRate:
        totalFunctionsFound === 0
          ? 0
          : totalFunctionsHit / totalFunctionsFound,
      files,
      gaps,
      timestamp: new Date().toISOString(),
    };
  }

  private createTestSuggestion(
    gap: CoverageGap,
    _sourceCode: string,
  ): TestSuggestion {
    const testFile = gap.filePath.replace(
      /\.ts$/,
      ".test.ts",
    );

    let testDescription: string;
    let skeletonCode: string;

    switch (gap.type) {
      case "function":
        testDescription = `未テスト関数のテスト: ${gap.location}`;
        skeletonCode = [
          `import { describe, it, expect } from "vitest";`,
          ``,
          `describe("${gap.location}", () => {`,
          `  it("正常系: 期待される結果を返す", () => {`,
          `    // Arrange`,
          `    // Act`,
          `    // Assert`,
          `    expect(true).toBe(true); // TODO: 実装`,
          `  });`,
          ``,
          `  it("異常系: エラーを適切に処理する", () => {`,
          `    // Arrange`,
          `    // Act & Assert`,
          `    expect(() => { /* TODO */ }).toThrow();`,
          `  });`,
          `});`,
        ].join("\n");
        break;

      case "branch":
        testDescription = `未カバーブランチのテスト: ${gap.location}`;
        skeletonCode = [
          `import { describe, it, expect } from "vitest";`,
          ``,
          `describe("${gap.location} - ブランチカバレッジ", () => {`,
          `  it("条件分岐A: trueの場合", () => {`,
          `    // TODO: 条件がtrueの場合のテスト`,
          `    expect(true).toBe(true);`,
          `  });`,
          ``,
          `  it("条件分岐A: falseの場合", () => {`,
          `    // TODO: 条件がfalseの場合のテスト`,
          `    expect(true).toBe(true);`,
          `  });`,
          `});`,
        ].join("\n");
        break;

      case "line":
      default:
        testDescription = `未カバー行のテスト: ${gap.location}`;
        skeletonCode = [
          `import { describe, it, expect } from "vitest";`,
          ``,
          `describe("${gap.location} - 行カバレッジ改善", () => {`,
          `  it("未カバー行を通過するテスト", () => {`,
          `    // TODO: 未カバー行を実行するテストケースを実装`,
          `    expect(true).toBe(true);`,
          `  });`,
          `});`,
        ].join("\n");
        break;
    }

    return {
      targetFile: testFile,
      testDescription,
      testType: "unit",
      priority: gap.severity,
      rationale: gap.description,
      skeletonCode,
    };
  }

  private generateStepsFromRequirement(req: Requirement): E2EStep[] {
    const steps: E2EStep[] = [];
    let order = 1;

    // 前提条件のセットアップ
    steps.push({
      order: order++,
      action: "テスト環境を初期状態にセットアップする",
      expected: "環境が正常に初期化されること",
    });

    // メイン操作
    steps.push({
      order: order++,
      action: `機能を実行する: ${req.description.slice(0, 60)}`,
      expected: "操作が正常に完了すること",
    });

    // 受け入れ基準の検証
    if (req.acceptanceCriteria.length > 0) {
      for (const criteria of req.acceptanceCriteria) {
        steps.push({
          order: order++,
          action: `結果を検証する: ${criteria}`,
          expected: criteria,
        });
      }
    } else {
      steps.push({
        order: order++,
        action: "出力結果を確認する",
        expected: "期待される結果が得られること",
      });
    }

    return steps;
  }
}
