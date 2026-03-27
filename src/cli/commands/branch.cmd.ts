/**
 * Branch Commands
 * atelier branch list/merge/delete/retry
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { ManageBranchesUseCase } from "../../application/use-cases/manage-branches.use-case.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
} from "../output.js";

export function createBranchCommand(): Command {
  const branch = new Command("branch")
    .description("atelier/ ブランチの管理");

  // branch list
  branch
    .command("list")
    .description("atelier/ プレフィックスのブランチ一覧を表示")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        const branches = await useCase.listBranches();

        if (branches.length === 0) {
          printWarning("atelier/ ブランチが見つかりません");
          return;
        }

        const rows = branches.map((b) => {
          const nameDisplay = b.current
            ? chalk.green(`* ${b.name}`)
            : `  ${b.name}`;
          return [nameDisplay, b.commit.slice(0, 8), b.label];
        });

        printTable(["Branch", "Commit", "Label"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch merge <name>
  branch
    .command("merge <name>")
    .description("指定ブランチをメインブランチにマージする")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = ora(`ブランチ '${name}' をマージ中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        await useCase.mergeBranch(name);
        spinner.stop();
        printSuccess(`ブランチ '${name}' をメインブランチにマージしました`);
      } catch (error) {
        spinner.fail("マージに失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch delete <name>
  branch
    .command("delete <name>")
    .description("指定ブランチを削除する（worktreeも削除）")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = ora(`ブランチ '${name}' を削除中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        await useCase.deleteBranch(name);
        spinner.stop();
        printSuccess(`ブランチ '${name}' を削除しました`);
      } catch (error) {
        spinner.fail("削除に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // branch retry <name>
  branch
    .command("retry <name>")
    .description("指定ブランチを再実行する（ブランチを再作成）")
    .action(async (name: string) => {
      const projectPath = process.cwd();
      const spinner = ora(`ブランチ '${name}' を再実行中...`).start();

      try {
        const useCase = new ManageBranchesUseCase(projectPath);
        await useCase.retryBranch(name);
        spinner.stop();
        printSuccess(`ブランチ '${name}' を再作成しました`);
      } catch (error) {
        spinner.fail("再実行に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return branch;
}
