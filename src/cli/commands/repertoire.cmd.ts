/**
 * Repertoire Commands
 * atelier repertoire add/list/remove - テンプレートパッケージの管理
 */

import { Command } from "commander";
import { ManageRepertoireUseCase } from "../../application/use-cases/manage-repertoire.use-case.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
  createSpinner,
} from "../output.js";

export function createRepertoireCommand(): Command {
  const repertoire = new Command("repertoire")
    .description("Repertoire（テンプレートパッケージ）の管理");

  // repertoire add <url>
  repertoire
    .command("add <url>")
    .description("GitHub リポジトリから Repertoire をインストール")
    .action(async (url: string) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(`Repertoire をインストール中...`).start();

      try {
        const useCase = new ManageRepertoireUseCase();
        const result = await useCase.install(url, projectPath);

        spinner.succeed(
          `Repertoire '${result.name}' をインストールしました`,
        );
        printSuccess(`ソース: ${result.source}`);
        printSuccess(`バージョン: ${result.version}`);
      } catch (error) {
        spinner.fail("インストールに失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // repertoire list
  repertoire
    .command("list")
    .description("インストール済み Repertoire を一覧表示")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const useCase = new ManageRepertoireUseCase();
        const repertoires = await useCase.list(projectPath);

        if (repertoires.length === 0) {
          printWarning("インストール済みの Repertoire がありません");
          return;
        }

        const rows = repertoires.map((r) => [
          r.name,
          r.source,
          r.version,
          r.installedAt,
        ]);

        printTable(["Name", "Source", "Version", "Installed At"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // repertoire remove <name>
  repertoire
    .command("remove <name>")
    .description("Repertoire を削除する")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = createSpinner(
        `Repertoire '${name}' を削除中...`,
      ).start();

      try {
        const useCase = new ManageRepertoireUseCase();
        await useCase.remove(name, projectPath);

        spinner.succeed(`Repertoire '${name}' を削除しました`);
      } catch (error) {
        spinner.fail("削除に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return repertoire;
}
