/**
 * Analyze Commands
 * atelier analyze codebase/dependencies/complexity/migration
 */

import { Command } from "commander";
import ora from "ora";
import path from "node:path";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import { CodebaseAnalyzerService } from "../../domain/services/codebase-analyzer.service.js";
import {
  printTable,
  printSuccess,
  printError,
  printInfo,
  printWarning,
} from "../output.js";

export function createAnalyzeCommand(): Command {
  const analyze = new Command("analyze").description(
    "コードベース分析・レガシーシステム評価",
  );

  // analyze codebase [path]
  analyze
    .command("codebase [path]")
    .description("コードベースの構造を分析する")
    .action(async (targetPath?: string) => {
      const workingDir = targetPath
        ? path.resolve(targetPath)
        : process.cwd();
      const spinner = ora("コードベース構造を分析中...").start();

      try {
        const service = new CodebaseAnalyzerService();
        const structure = await service.analyzeStructure(workingDir);
        spinner.stop();

        printSuccess("コードベース構造分析が完了しました");
        console.log();

        printInfo(`ルートディレクトリ: ${structure.rootDir}`);
        printInfo(`総ファイル数: ${structure.totalFiles}`);
        printInfo(`総行数: ${structure.totalLines.toLocaleString()}`);
        console.log();

        // 技術スタック
        if (structure.detectedStack.length > 0) {
          printInfo(`検出された技術スタック: ${structure.detectedStack.join(", ")}`);
        }

        // エントリポイント
        if (structure.entryPoints.length > 0) {
          printInfo(`エントリポイント: ${structure.entryPoints.join(", ")}`);
        }
        console.log();

        // 拡張子別ファイル数
        const extRows = Object.entries(structure.filesByExtension)
          .sort(([, a], [, b]) => b - a)
          .map(([ext, count]) => [
            ext,
            String(count),
            String(structure.linesByExtension[ext] ?? 0),
          ]);

        if (extRows.length > 0) {
          printTable(["Extension", "Files", "Lines"], extRows);
        }

        // 設定ファイル
        if (structure.configFiles.length > 0) {
          console.log();
          printInfo("設定ファイル:");
          for (const cf of structure.configFiles) {
            console.log(`  - ${cf}`);
          }
        }
      } catch (error) {
        spinner.fail("コードベース分析に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // analyze dependencies [path]
  analyze
    .command("dependencies [path]")
    .description("依存関係を分析する")
    .action(async (targetPath?: string) => {
      const workingDir = targetPath
        ? path.resolve(targetPath)
        : process.cwd();
      const spinner = ora("依存関係を分析中...").start();

      try {
        const service = new CodebaseAnalyzerService();
        const graph = await service.analyzeDependencies(workingDir);
        spinner.stop();

        printSuccess("依存関係分析が完了しました");
        console.log();

        printInfo(`直接依存: ${graph.direct.length} パッケージ`);
        printInfo(`推移的依存: ${graph.transitive} パッケージ`);
        console.log();

        // 直接依存一覧
        if (graph.direct.length > 0) {
          const depRows = graph.direct.map((d) => [
            d.name,
            d.version,
            d.isOutdated ? "Yes" : "No",
          ]);
          printTable(["Package", "Version", "Outdated"], depRows);
        }

        // 古い依存
        if (graph.outdated.length > 0) {
          console.log();
          printWarning(`古い依存: ${graph.outdated.length} パッケージ`);
          const outdatedRows = graph.outdated.map((d) => [
            d.name,
            d.version,
            d.latest ?? "unknown",
          ]);
          printTable(["Package", "Current", "Latest"], outdatedRows);
        }

        // 脆弱な依存
        if (graph.vulnerable.length > 0) {
          console.log();
          printError(`脆弱な依存: ${graph.vulnerable.length} パッケージ`);
          const vulnRows = graph.vulnerable.map((d) => [d.name, d.version]);
          printTable(["Package", "Version Range"], vulnRows);
        }
      } catch (error) {
        spinner.fail("依存関係分析に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // analyze complexity <file>
  analyze
    .command("complexity <file>")
    .description("ファイルの複雑度を分析する")
    .action(async (file: string) => {
      const filePath = path.resolve(file);
      const spinner = ora(`${path.basename(file)} の複雑度を分析中...`).start();

      try {
        const content = await readTextFile(filePath);
        const service = new CodebaseAnalyzerService();
        const complexity = service.analyzeComplexity(filePath, content);
        spinner.stop();

        printSuccess("ファイル複雑度分析が完了しました");
        console.log();

        printTable(
          ["Metric", "Value"],
          [
            ["File", complexity.filePath],
            ["Lines", String(complexity.lines)],
            ["Imports", String(complexity.imports)],
            ["Functions", String(complexity.functions)],
            ["Classes", String(complexity.classes)],
            ["Complexity Score", `${complexity.complexityScore}/100`],
          ],
        );

        // TODO/FIXME コメント
        if (complexity.todos.length > 0) {
          console.log();
          printWarning(`TODO/FIXME コメント: ${complexity.todos.length} 件`);
          const todoRows = complexity.todos.map((t) => [
            String(t.line),
            t.type,
            t.text,
          ]);
          printTable(["Line", "Type", "Text"], todoRows);
        }
      } catch (error) {
        spinner.fail("複雑度分析に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // analyze migration --target <stack>
  analyze
    .command("migration")
    .description("マイグレーション計画を生成する")
    .requiredOption("--target <stack>", "移行先の技術スタック")
    .option("--path <path>", "対象ディレクトリ")
    .action(async (opts) => {
      const workingDir = opts.path
        ? path.resolve(opts.path)
        : process.cwd();
      const spinner = ora("マイグレーション計画を生成中...").start();

      try {
        const service = new CodebaseAnalyzerService();
        const structure = await service.analyzeStructure(workingDir);
        const plan = service.generateMigrationPlan(structure, opts.target);
        spinner.stop();

        printSuccess("マイグレーション計画が生成されました");
        console.log();

        printInfo(`移行先: ${opts.target}`);
        printInfo(`推定複雑度: ${plan.estimatedComplexity}`);
        console.log();

        // フェーズ一覧
        for (const phase of plan.phases) {
          const riskColor =
            phase.riskLevel === "high"
              ? "!"
              : phase.riskLevel === "medium"
                ? "~"
                : " ";
          console.log(
            `${riskColor} Phase: ${phase.name} [risk: ${phase.riskLevel}]`,
          );
          console.log(`  ${phase.description}`);
          for (const task of phase.tasks) {
            console.log(`    - ${task}`);
          }
          if (phase.dependencies.length > 0) {
            console.log(
              `  depends on: ${phase.dependencies.join(", ")}`,
            );
          }
          console.log();
        }

        // リスク
        if (plan.risks.length > 0) {
          printWarning("リスク:");
          for (const risk of plan.risks) {
            console.log(`  - ${risk}`);
          }
        }
      } catch (error) {
        spinner.fail("マイグレーション計画の生成に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return analyze;
}
