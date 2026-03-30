/**
 * Technique Commands
 * atelier technique eject/list - ビルトイン Commission の管理
 */

import { Command } from "commander";
import { EjectCommissionUseCase } from "../../application/use-cases/eject-commission.use-case.js";
import {
  listBuiltinCommissions,
  getBuiltinCommission,
} from "../../builtin/index.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  createSpinner,
} from "../output.js";

export function createTechniqueCommand(): Command {
  const technique = new Command("technique")
    .description("ビルトイン Commission（テクニック）の管理");

  // technique list
  technique
    .command("list")
    .description("利用可能なビルトイン Commission を一覧表示")
    .action(async () => {
      try {
        const names = listBuiltinCommissions();
        const rows: string[][] = [];

        for (const name of names) {
          const commission = (await getBuiltinCommission(name)) as Record<
            string,
            unknown
          >;
          const description = (commission.description as string) ?? "-";
          const strokes = Array.isArray(commission.strokes)
            ? commission.strokes.length
            : 0;
          rows.push([name, description, String(strokes)]);
        }

        printTable(["Name", "Description", "Strokes"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // technique eject <name>
  technique
    .command("eject <name>")
    .description("ビルトイン Commission をローカルに展開して編集可能にする")
    .option("--force", "既存ファイルを上書きする", false)
    .action(async (name: string, opts) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(
        `ビルトイン Commission '${name}' を展開中...`,
      ).start();

      try {
        const useCase = new EjectCommissionUseCase();
        const result = await useCase.execute(name, projectPath, {
          force: opts.force,
        });

        spinner.stop();

        if (result.copiedFiles.length > 0) {
          printSuccess(
            `Commission '${name}' を展開しました (${result.copiedFiles.length} ファイル)`,
          );
          for (const file of result.copiedFiles) {
            printInfo(`  コピー: ${file}`);
          }
        }

        if (result.skippedFiles.length > 0) {
          for (const file of result.skippedFiles) {
            printWarning(`  スキップ（既存）: ${file}`);
          }
          printInfo(
            "既存ファイルを上書きするには --force オプションを使用してください",
          );
        }
      } catch (error) {
        spinner.fail("展開に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return technique;
}
