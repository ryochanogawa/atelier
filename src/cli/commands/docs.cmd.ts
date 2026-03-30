/**
 * Docs Commands
 * atelier docs audit/generate/knowledge/refresh
 */

import { Command } from "commander";
import path from "node:path";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import { DocManagerService } from "../../domain/services/doc-manager.service.js";
import {
  printTable,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  createSpinner,
} from "../output.js";

export function createDocsCommand(): Command {
  const docs = new Command("docs").description(
    "ドキュメント管理・自動更新",
  );

  // docs audit [path]
  docs
    .command("audit [path]")
    .description("ドキュメントの鮮度をチェックする")
    .action(async (targetPath?: string) => {
      const workingDir = targetPath
        ? path.resolve(targetPath)
        : process.cwd();
      const spinner = createSpinner("ドキュメントの鮮度をチェック中...").start();

      try {
        const service = new DocManagerService();
        const staleDocs = await service.detectStaleDocuments(workingDir);
        spinner.stop();

        if (staleDocs.length === 0) {
          printInfo("ドキュメントファイルが見つかりませんでした");
          return;
        }

        printSuccess(`${staleDocs.length} 件のドキュメントを検出しました`);
        console.log();

        // ステータス別集計
        const statusCounts = { fresh: 0, aging: 0, stale: 0, obsolete: 0 };
        for (const doc of staleDocs) {
          statusCounts[doc.status]++;
        }

        printTable(
          ["Status", "Count"],
          [
            ["Fresh (0-7 days)", String(statusCounts.fresh)],
            ["Aging (8-30 days)", String(statusCounts.aging)],
            ["Stale (31-90 days)", String(statusCounts.stale)],
            ["Obsolete (90+ days)", String(statusCounts.obsolete)],
          ],
        );
        console.log();

        // 詳細一覧
        const rows = staleDocs.map((doc) => [
          doc.filePath,
          doc.status,
          String(doc.freshnessScore),
          doc.lastModified.toISOString().slice(0, 10),
          String(doc.relatedSourceFiles.length),
        ]);

        printTable(
          ["Document", "Status", "Score", "Last Modified", "Related Files"],
          rows,
        );

        // 警告
        const staleCount = statusCounts.stale + statusCounts.obsolete;
        if (staleCount > 0) {
          console.log();
          printWarning(
            `${staleCount} 件のドキュメントが陳腐化しています。更新を検討してください。`,
          );
        }
      } catch (error) {
        spinner.fail("ドキュメント鮮度チェックに失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // docs generate <file>
  docs
    .command("generate <file>")
    .description("ソースコードからドキュメントを生成する")
    .action(async (file: string) => {
      const filePath = path.resolve(file);
      const spinner = createSpinner(
        `${path.basename(file)} からドキュメントを生成中...`,
      ).start();

      try {
        const content = await readTextFile(filePath);
        const service = new DocManagerService();
        const result = await service.generateDocFromCode(filePath, content);
        spinner.stop();

        printSuccess("ドキュメントスケルトンを生成しました");
        console.log();

        printInfo(`対象ファイル: ${result.filePath}`);
        printInfo(`生成セクション: ${result.sections.join(", ")}`);
        console.log();

        // 生成されたドキュメントを表示
        console.log("--- Generated Document ---");
        console.log(result.content);
        console.log("--- End ---");
      } catch (error) {
        spinner.fail("ドキュメント生成に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // docs knowledge [path]
  docs
    .command("knowledge [path]")
    .description("プロジェクトのナレッジを収集する")
    .option("--limit <n>", "表示件数の上限", "30")
    .action(async (targetPath: string | undefined, opts) => {
      const workingDir = targetPath
        ? path.resolve(targetPath)
        : process.cwd();
      const limit = parseInt(opts.limit, 10) || 30;
      const spinner = createSpinner("ナレッジを収集中...").start();

      try {
        const service = new DocManagerService();
        const entries = await service.collectKnowledge(workingDir);
        spinner.stop();

        if (entries.length === 0) {
          printInfo("ナレッジが見つかりませんでした");
          return;
        }

        printSuccess(`${entries.length} 件のナレッジを収集しました`);
        console.log();

        // ソース別集計
        const sourceCounts: Record<string, number> = {};
        for (const entry of entries) {
          sourceCounts[entry.source] =
            (sourceCounts[entry.source] ?? 0) + 1;
        }
        printTable(
          ["Source", "Count"],
          Object.entries(sourceCounts).map(([src, count]) => [
            src,
            String(count),
          ]),
        );
        console.log();

        // 上位エントリ表示
        const displayed = entries.slice(0, limit);
        const rows = displayed.map((entry) => [
          entry.source,
          entry.content.length > 60
            ? entry.content.slice(0, 57) + "..."
            : entry.content,
          entry.filePath ?? "-",
          String(entry.relevance),
          entry.date.toISOString().slice(0, 10),
        ]);

        printTable(
          ["Source", "Content", "File", "Relevance", "Date"],
          rows,
        );
      } catch (error) {
        spinner.fail("ナレッジ収集に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // docs refresh
  docs
    .command("refresh")
    .description("doc-refresh Commission を実行してドキュメントを更新する")
    .option("--dry-run", "ドライラン（実際には実行しない）", false)
    .option("--medium <name>", "使用する Medium を指定")
    .action(async (opts) => {
      printInfo("doc-refresh Commission を実行します");
      printInfo(
        "実行コマンド: atelier commission run doc-refresh" +
          (opts.dryRun ? " --dry-run" : "") +
          (opts.medium ? ` --medium ${opts.medium}` : ""),
      );
      console.log();
      printWarning(
        "Commission の実行には `atelier commission run doc-refresh` を直接使用してください。",
      );
    });

  return docs;
}
