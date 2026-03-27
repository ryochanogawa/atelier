/**
 * DiffAnalyzerService Domain Service
 * 差分解析・リスクスコアリングエンジン。
 */

import {
  type DiffAnalysis,
  type RiskAssessment,
  type RiskFactor,
  type ImpactSummary,
  createDiffAnalysis,
  createRiskAssessment,
} from "../value-objects/risk-assessment.vo.js";

/** ファイルカテゴリとその重み */
const CATEGORY_WEIGHTS: Record<string, number> = {
  src: 1.0,
  test: 0.3,
  config: 1.5,
  docs: 0.1,
  ci: 1.8,
  other: 0.5,
};

/** カテゴリ分類パターン */
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/^\.github\/|^\.gitlab-ci|^Jenkinsfile|^\.circleci\/|ci\//i, "ci"],
  [/\.(test|spec)\.[^.]+$|__tests__\/|tests?\//i, "test"],
  [/^src\/|^lib\/|^app\//i, "src"],
  [/\.(md|txt|rst)$|^docs?\//i, "docs"],
  [/\.(json|ya?ml|toml|ini|env|config)\b|\.config\.[^.]+$|^\..*rc$/i, "config"],
];

export class DiffAnalyzerService {
  /**
   * diff テキストを解析し、DiffAnalysis を返す。
   */
  analyzeDiff(diffText: string): DiffAnalysis {
    const files = this.parseDiffFiles(diffText);

    let totalAdditions = 0;
    let totalDeletions = 0;
    const filesByCategory: Record<string, string[]> = {};
    let complexityScore = 0;

    for (const file of files) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;

      const category = this.categorizeFile(file.path);
      if (!filesByCategory[category]) {
        filesByCategory[category] = [];
      }
      filesByCategory[category].push(file.path);

      const weight = CATEGORY_WEIGHTS[category] ?? CATEGORY_WEIGHTS.other;
      complexityScore += (file.additions + file.deletions) * weight;
    }

    return createDiffAnalysis({
      totalFiles: files.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      filesByCategory,
      complexityScore: Math.round(complexityScore * 100) / 100,
    });
  }

  /**
   * DiffAnalysis からリスクスコアを計算する。
   */
  calculateRiskScore(analysis: DiffAnalysis): RiskAssessment {
    const factors: RiskFactor[] = [];
    let score = 0;

    // ファクター1: 変更ファイル数
    if (analysis.totalFiles > 20) {
      const weight = Math.min(20, (analysis.totalFiles - 20) * 0.5);
      factors.push({
        category: "file_count",
        description: `大量のファイル変更 (${analysis.totalFiles} files)`,
        weight,
      });
      score += weight;
    }

    // ファクター2: 変更行数
    const totalChanges = analysis.additions + analysis.deletions;
    if (totalChanges > 500) {
      const weight = Math.min(25, (totalChanges - 500) * 0.02);
      factors.push({
        category: "change_volume",
        description: `大量のコード変更 (+${analysis.additions} -${analysis.deletions})`,
        weight,
      });
      score += weight;
    }

    // ファクター3: 設定ファイル変更
    const configFiles = analysis.filesByCategory.config ?? [];
    if (configFiles.length > 0) {
      const weight = configFiles.length * 5;
      factors.push({
        category: "config_change",
        description: `設定ファイルの変更 (${configFiles.join(", ")})`,
        weight: Math.min(15, weight),
      });
      score += Math.min(15, weight);
    }

    // ファクター4: CI/CD ファイル変更
    const ciFiles = analysis.filesByCategory.ci ?? [];
    if (ciFiles.length > 0) {
      const weight = ciFiles.length * 8;
      factors.push({
        category: "ci_change",
        description: `CI/CD パイプラインの変更 (${ciFiles.join(", ")})`,
        weight: Math.min(20, weight),
      });
      score += Math.min(20, weight);
    }

    // ファクター5: テスト不足
    const srcFiles = analysis.filesByCategory.src ?? [];
    const testFiles = analysis.filesByCategory.test ?? [];
    if (srcFiles.length > 0 && testFiles.length === 0) {
      const weight = Math.min(15, srcFiles.length * 3);
      factors.push({
        category: "missing_tests",
        description: `ソースコード変更に対するテストが不足 (src: ${srcFiles.length}, test: 0)`,
        weight,
      });
      score += weight;
    }

    // ファクター6: 複雑度スコア
    if (analysis.complexityScore > 100) {
      const weight = Math.min(15, (analysis.complexityScore - 100) * 0.05);
      factors.push({
        category: "complexity",
        description: `高い変更複雑度 (score: ${analysis.complexityScore})`,
        weight,
      });
      score += weight;
    }

    // ファクター7: 削除が多い（リファクタリングリスク）
    if (analysis.deletions > analysis.additions && analysis.deletions > 100) {
      const weight = Math.min(10, (analysis.deletions - analysis.additions) * 0.01);
      factors.push({
        category: "large_deletion",
        description: `大量のコード削除 (${analysis.deletions} lines)`,
        weight,
      });
      score += weight;
    }

    return createRiskAssessment({ score, factors });
  }

  /**
   * 影響サマリーを生成する。
   */
  generateImpactSummary(analysis: DiffAnalysis): ImpactSummary {
    const affectedComponents: string[] = [];
    const suggestedReviewScope: string[] = [];
    const suggestedTestScope: string[] = [];

    // 影響コンポーネントの特定
    const srcFiles = analysis.filesByCategory.src ?? [];
    const componentSet = new Set<string>();
    for (const file of srcFiles) {
      const parts = file.split("/");
      // src/domain/services/foo.ts -> domain/services
      if (parts.length >= 3) {
        componentSet.add(parts.slice(0, Math.min(3, parts.length - 1)).join("/"));
      } else if (parts.length >= 2) {
        componentSet.add(parts[0]);
      }
    }
    affectedComponents.push(...componentSet);

    // レビュー範囲の推奨
    for (const [category, files] of Object.entries(analysis.filesByCategory)) {
      if (files.length > 0) {
        suggestedReviewScope.push(
          `${category} (${files.length} file${files.length > 1 ? "s" : ""})`,
        );
      }
    }

    // テスト範囲の推奨
    if (srcFiles.length > 0) {
      for (const file of srcFiles) {
        const testFile = file
          .replace(/\.ts$/, ".test.ts")
          .replace(/\.js$/, ".test.js");
        suggestedTestScope.push(testFile);
      }
    }

    // サマリーテキスト生成
    const totalChanges = analysis.additions + analysis.deletions;
    const summaryParts: string[] = [
      `${analysis.totalFiles} ファイルが変更されました`,
      `(+${analysis.additions} -${analysis.deletions}, 計 ${totalChanges} 行)`,
    ];
    if (affectedComponents.length > 0) {
      summaryParts.push(
        `影響コンポーネント: ${affectedComponents.join(", ")}`,
      );
    }

    return Object.freeze({
      affectedComponents: Object.freeze([...affectedComponents]) as string[],
      suggestedReviewScope: Object.freeze([...suggestedReviewScope]) as string[],
      suggestedTestScope: Object.freeze([...suggestedTestScope]) as string[],
      summary: summaryParts.join("。"),
    });
  }

  /**
   * unified diff テキストからファイル情報をパースする。
   */
  private parseDiffFiles(
    diffText: string,
  ): { path: string; additions: number; deletions: number }[] {
    const files: { path: string; additions: number; deletions: number }[] = [];
    const diffBlocks = diffText.split(/^diff --git /m);

    for (const block of diffBlocks) {
      if (!block.trim()) continue;

      // ファイルパスの抽出: "a/path/to/file b/path/to/file"
      const headerMatch = block.match(/^a\/(.+?)\s+b\/(.+)/m);
      if (!headerMatch) continue;

      const filePath = headerMatch[2];
      let additions = 0;
      let deletions = 0;

      // 行単位で +/- をカウント
      const lines = block.split("\n");
      for (const line of lines) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+")) additions++;
        else if (line.startsWith("-")) deletions++;
      }

      files.push({ path: filePath, additions, deletions });
    }

    return files;
  }

  /**
   * ファイルパスをカテゴリに分類する。
   */
  private categorizeFile(filePath: string): string {
    for (const [pattern, category] of CATEGORY_PATTERNS) {
      if (pattern.test(filePath)) {
        return category;
      }
    }
    return "other";
  }
}
