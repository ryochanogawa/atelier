/**
 * Review Commands
 * atelier review diff / scan / gate
 */

import { Command } from "commander";
import Table from "cli-table3";
import { DiffAnalyzerService } from "../../domain/services/diff-analyzer.service.js";
import { SecurityScannerService } from "../../domain/services/security-scanner.service.js";
import { LinterIntegrationService } from "../../domain/services/linter-integration.service.js";
import { PolicyEngineService } from "../../domain/services/policy-engine.service.js";
import type { DiffAnalysis, RiskAssessment } from "../../domain/value-objects/risk-assessment.vo.js";
import type { SecurityScanResult, LicenseScanResult } from "../../domain/value-objects/security-scan.vo.js";
import type { PolicyEvaluation, PolicyContext } from "../../domain/value-objects/policy-evaluation.vo.js";
import {
  printSuccess,
  printError,
  printWarning,
  printInfo,
  getOutputFormat,
  createSpinner,
} from "../output.js";
import { COLORS } from "../theme.js";

/**
 * git diff を取得する。
 */
async function getGitDiff(cwd: string, target?: string): Promise<string> {
  const { execa } = await import("execa");
  const args = target ? ["diff", target] : ["diff", "HEAD"];
  const result = await execa("git", args, { cwd, reject: false });
  return result.stdout;
}

/**
 * リスクレベルに応じた色を返す。
 */
function riskColor(level: RiskAssessment["level"]): (text: string) => string {
  switch (level) {
    case "low":
      return COLORS.success;
    case "medium":
      return COLORS.warning;
    case "high":
      return COLORS.error;
    case "critical":
      return COLORS.error.bold;
  }
}

/**
 * DiffAnalysis の表示。
 */
function printDiffAnalysis(analysis: DiffAnalysis): void {
  console.log();
  console.log(COLORS.accent.bold("差分解析結果"));
  console.log(COLORS.muted("─".repeat(50)));

  const summaryTable = new Table({
    colWidths: [20, 40],
    style: { head: [], border: [] },
  });

  summaryTable.push(
    ["変更ファイル数", String(analysis.totalFiles)],
    ["追加行数", COLORS.success(`+${analysis.additions}`)],
    ["削除行数", COLORS.error(`-${analysis.deletions}`)],
    ["複雑度スコア", String(analysis.complexityScore)],
  );

  console.log(summaryTable.toString());

  // カテゴリ別ファイル
  if (Object.keys(analysis.filesByCategory).length > 0) {
    console.log();
    console.log(COLORS.accent.bold("カテゴリ別ファイル"));

    const catTable = new Table({
      head: [COLORS.accent("カテゴリ"), COLORS.accent("ファイル数"), COLORS.accent("ファイル")],
      style: { head: [], border: [] },
      colWidths: [12, 12, 50],
      wordWrap: true,
    });

    for (const [category, files] of Object.entries(analysis.filesByCategory)) {
      catTable.push([category, String(files.length), files.join("\n")]);
    }

    console.log(catTable.toString());
  }
}

/**
 * RiskAssessment の表示。
 */
function printRiskAssessment(risk: RiskAssessment): void {
  console.log();
  console.log(COLORS.accent.bold("リスク評価"));
  console.log(COLORS.muted("─".repeat(50)));

  const colorFn = riskColor(risk.level);
  console.log(`  スコア: ${colorFn(`${risk.score}/100`)} (${colorFn(risk.level.toUpperCase())})`);
  console.log(`  自動承認: ${risk.autoApprovable ? COLORS.success("可能") : COLORS.warning("不可")}`);

  if (risk.factors.length > 0) {
    console.log();
    console.log(COLORS.accent.bold("  リスクファクター:"));
    for (const factor of risk.factors) {
      console.log(`    - [${factor.category}] ${factor.description} (weight: ${factor.weight.toFixed(1)})`);
    }
  }
}

/**
 * SecurityScanResult の表示。
 */
function printSecurityScan(scan: SecurityScanResult): void {
  console.log();
  console.log(COLORS.accent.bold("セキュリティスキャン結果"));
  console.log(COLORS.muted("─".repeat(50)));

  const summaryTable = new Table({
    colWidths: [20, 15],
    style: { head: [], border: [] },
  });

  summaryTable.push(
    ["Critical", scan.summary.critical > 0 ? COLORS.error.bold(` ${scan.summary.critical} `) : COLORS.success("0")],
    ["High", scan.summary.high > 0 ? COLORS.error(String(scan.summary.high)) : COLORS.success("0")],
    ["Moderate", scan.summary.moderate > 0 ? COLORS.warning(String(scan.summary.moderate)) : COLORS.success("0")],
    ["Low", String(scan.summary.low)],
    ["Info", String(scan.summary.info)],
    ["合計", String(scan.summary.total)],
  );

  console.log(summaryTable.toString());

  if (scan.vulnerabilities.length > 0) {
    console.log();
    const criticalAndHigh = scan.vulnerabilities.filter(
      (v) => v.severity === "critical" || v.severity === "high",
    );
    if (criticalAndHigh.length > 0) {
      console.log(COLORS.error.bold("  重要な脆弱性:"));
      for (const vuln of criticalAndHigh) {
        console.log(`    - ${COLORS.error(`[${vuln.severity.toUpperCase()}]`)} ${vuln.package}: ${vuln.name}`);
        if (vuln.fixAvailable) {
          console.log(COLORS.success(`      修正可能`));
        }
      }
    }
  }
}

/**
 * LicenseScanResult の表示。
 */
function printLicenseScan(scan: LicenseScanResult): void {
  console.log();
  console.log(COLORS.accent.bold("ライセンスチェック結果"));
  console.log(COLORS.muted("─".repeat(50)));

  console.log(`  チェック済みパッケージ: ${scan.licenses.length}`);

  if (scan.violations.length > 0) {
    printWarning(`${scan.violations.length} 件のライセンス違反を検出`);
    for (const v of scan.violations) {
      console.log(`    - ${COLORS.error(v.package)}@${v.version}: ${v.license}`);
    }
  } else {
    printSuccess("ライセンス違反なし");
  }
}

/**
 * PolicyEvaluation の表示。
 */
function printPolicyEvaluation(evaluation: PolicyEvaluation): void {
  console.log();
  console.log(COLORS.accent.bold("ポリシー評価結果"));
  console.log(COLORS.muted("─".repeat(50)));

  if (evaluation.approved) {
    if (evaluation.autoApproved) {
      printSuccess("自動承認されました");
    } else {
      printSuccess("承認されました（手動確認推奨）");
    }
  } else {
    printError("却下されました");
  }

  if (evaluation.violations.length > 0) {
    console.log();
    console.log(COLORS.accent.bold("  違反事項:"));
    for (const v of evaluation.violations) {
      const icon = v.severity === "error" ? COLORS.error("ERROR") : COLORS.warning("WARN");
      console.log(`    [${icon}] ${v.ruleName}: ${v.description}`);
    }
  }

  if (evaluation.requiredApprovers.length > 0) {
    console.log();
    console.log(COLORS.accent.bold("  必要な承認者:"));
    for (const approver of evaluation.requiredApprovers) {
      console.log(`    - ${approver}`);
    }
  }
}

export function createReviewCommand(): Command {
  const review = new Command("review").description(
    "レビューゲート（差分分析・セキュリティスキャン・ポリシーチェック）",
  );

  // review diff
  review
    .command("diff")
    .description("差分分析 + リスクスコア表示")
    .option("--target <ref>", "比較対象の git ref (デフォルト: HEAD)")
    .option("--json", "JSON 形式で出力", false)
    .action(async (opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner("差分を解析中...").start();

      try {
        const diffText = await getGitDiff(projectPath, opts.target);

        if (!diffText.trim()) {
          spinner.info("差分がありません");
          return;
        }

        const analyzer = new DiffAnalyzerService();
        const analysis = analyzer.analyzeDiff(diffText);
        const risk = analyzer.calculateRiskScore(analysis);
        const impact = analyzer.generateImpactSummary(analysis);

        spinner.stop();

        if (opts.json || getOutputFormat() === "json") {
          console.log(
            JSON.stringify({ analysis, risk, impact }, null, 2),
          );
          return;
        }

        printDiffAnalysis(analysis);
        printRiskAssessment(risk);

        // 影響サマリー
        console.log();
        console.log(COLORS.accent.bold("影響サマリー"));
        console.log(COLORS.muted("─".repeat(50)));
        console.log(`  ${impact.summary}`);

        if (impact.affectedComponents.length > 0) {
          console.log();
          console.log(COLORS.accent.bold("  影響コンポーネント:"));
          for (const comp of impact.affectedComponents) {
            console.log(`    - ${comp}`);
          }
        }

        if (impact.suggestedReviewScope.length > 0) {
          console.log();
          console.log(COLORS.accent.bold("  推奨レビュー範囲:"));
          for (const scope of impact.suggestedReviewScope) {
            console.log(`    - ${scope}`);
          }
        }

        console.log();
      } catch (error) {
        spinner.fail("差分解析に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // review scan
  review
    .command("scan")
    .description("セキュリティスキャン（脆弱性・ライセンス・SBOM）")
    .option("--sbom", "SBOM を生成して表示する", false)
    .option("--json", "JSON 形式で出力", false)
    .action(async (opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner("セキュリティスキャン中...").start();

      try {
        const scanner = new SecurityScannerService();

        const [depScan, licenseScan] = await Promise.all([
          scanner.scanDependencies(projectPath),
          scanner.scanLicenses(projectPath),
        ]);

        let sbom = undefined;
        if (opts.sbom) {
          sbom = await scanner.generateSBOM(projectPath);
        }

        spinner.stop();

        if (opts.json || getOutputFormat() === "json") {
          console.log(
            JSON.stringify(
              {
                dependencies: depScan,
                licenses: licenseScan,
                ...(sbom ? { sbom } : {}),
              },
              null,
              2,
            ),
          );
          return;
        }

        printSecurityScan(depScan);
        printLicenseScan(licenseScan);

        if (sbom) {
          console.log();
          console.log(COLORS.accent.bold("SBOM (CycloneDX)"));
          console.log(COLORS.muted("─".repeat(50)));
          printInfo(`${sbom.components.length} コンポーネント`);
          printInfo(`生成日時: ${sbom.metadata.timestamp}`);
        }

        // 総合判定
        console.log();
        if (
          depScan.summary.critical > 0 ||
          depScan.summary.high > 0 ||
          licenseScan.violations.length > 0
        ) {
          printError("セキュリティスキャンに問題が検出されました");
          process.exitCode = 1;
        } else {
          printSuccess("セキュリティスキャン合格");
        }

        console.log();
      } catch (error) {
        spinner.fail("セキュリティスキャンに失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // review gate
  review
    .command("gate")
    .description(
      "review-gate Commission 実行（全自動レビューゲート）",
    )
    .option("--target <ref>", "比較対象の git ref (デフォルト: HEAD)")
    .option("--no-lint", "Linter実行をスキップ", false)
    .option("--json", "JSON 形式で出力", false)
    .action(async (opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner("レビューゲートを実行中...").start();

      try {
        // Step 1: セキュリティスキャン
        spinner.text = "Step 1/4: セキュリティスキャン...";
        const scanner = new SecurityScannerService();
        const depScan = await scanner.scanDependencies(projectPath);

        // Step 2: 差分解析
        spinner.text = "Step 2/4: 差分解析...";
        const diffText = await getGitDiff(projectPath, opts.target);
        const analyzer = new DiffAnalyzerService();

        let analysis: DiffAnalysis;
        if (diffText.trim()) {
          analysis = analyzer.analyzeDiff(diffText);
        } else {
          analysis = {
            totalFiles: 0,
            additions: 0,
            deletions: 0,
            filesByCategory: {},
            complexityScore: 0,
          };
        }

        // Step 3: リスク評価
        spinner.text = "Step 3/4: リスク評価...";
        const risk = analyzer.calculateRiskScore(analysis);
        const impact = analyzer.generateImpactSummary(analysis);

        // Step 3.5: Linter 実行（オプション）
        let linterResults: import("../../domain/value-objects/linter-result.vo.js").LinterResult[] = [];
        if (opts.lint !== false) {
          spinner.text = "Step 3.5/4: Linter 実行...";
          const linterService = new LinterIntegrationService();
          linterResults = await linterService.runLinters(projectPath);
        }

        // Step 4: ポリシーチェック
        spinner.text = "Step 4/4: ポリシーチェック...";
        const policyEngine = new PolicyEngineService();
        const policyContext: PolicyContext = {
          riskAssessment: risk,
          diffAnalysis: analysis,
          linterResults,
          commissionName: "review-gate",
        };
        const policyResult = policyEngine.evaluate(policyContext);

        spinner.stop();

        // 結果の出力
        if (opts.json || getOutputFormat() === "json") {
          console.log(
            JSON.stringify(
              {
                security: depScan,
                analysis,
                risk,
                impact,
                linterResults,
                policy: policyResult,
              },
              null,
              2,
            ),
          );
        } else {
          printDiffAnalysis(analysis);
          printRiskAssessment(risk);
          printSecurityScan(depScan);

          if (linterResults.length > 0) {
            console.log();
            console.log(COLORS.accent.bold("Linter結果"));
            console.log(COLORS.muted("─".repeat(50)));
            const errors = linterResults.filter((r) => r.severity === "error");
            const warnings = linterResults.filter((r) => r.severity === "warning");
            console.log(`  エラー: ${errors.length}, 警告: ${warnings.length}`);
            for (const err of errors.slice(0, 10)) {
              console.log(`    ${COLORS.error("ERROR")} ${err.file}:${err.line} - ${err.message}`);
            }
            if (errors.length > 10) {
              console.log(`    ... 他 ${errors.length - 10} 件`);
            }
          }

          printPolicyEvaluation(policyResult);

          // 最終判定
          console.log();
          console.log(COLORS.accent.bold("最終判定"));
          console.log(COLORS.muted("═".repeat(50)));
          if (policyResult.autoApproved) {
            printSuccess("自動承認: このPRは自動的に承認されました");
          } else if (policyResult.approved) {
            printWarning("条件付き承認: 手動レビューを推奨します");
          } else {
            printError("却下: 問題を修正してから再提出してください");
          }
          console.log();
        }

        // 終了コード
        if (!policyResult.approved) {
          process.exitCode = 1;
        }
      } catch (error) {
        spinner.fail("レビューゲートの実行に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return review;
}
