/**
 * Studio Commands
 * atelier studio init/check
 */

import { Command } from "commander";
import ora from "ora";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { StudioInitUseCase } from "../../application/use-cases/init-studio.use-case.js";
import { MediumCheckUseCase } from "../../application/use-cases/check-medium.use-case.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import { readTextFile, dirExists } from "../../infrastructure/fs/file-system.js";
import {
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
} from "../output.js";
import type { MediumConfig } from "../../shared/types.js";

export function createStudioCommand(): Command {
  const studio = new Command("studio")
    .description("Studio（作業環境）の管理");

  // studio init
  studio
    .command("init")
    .description(".atelier/ ディレクトリとテンプレートを生成")
    .action(async () => {
      const projectPath = process.cwd();
      const spinner = ora("Studio を初期化中...").start();

      try {
        const useCase = new StudioInitUseCase();
        const result = await useCase.execute(projectPath);

        spinner.stop();

        if (result.created) {
          printSuccess(`Studio を初期化しました: ${result.path}`);
          printInfo("作成されたファイル:");
          for (const file of result.filesCreated) {
            console.log(`  ${path.relative(projectPath, file)}`);
          }
        } else {
          printWarning(
            `Studio は既に初期化されています: ${result.path}`,
          );
        }
      } catch (error) {
        spinner.fail("Studio の初期化に失敗しました");
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // studio check
  studio
    .command("check")
    .description("Studio の設定と Medium の可用性を確認")
    .action(async () => {
      const projectPath = process.cwd();
      const atelierPath = resolveAtelierPath(projectPath);

      // .atelier ディレクトリの存在確認
      if (!(await dirExists(atelierPath))) {
        printError(
          ".atelier/ ディレクトリが見つかりません。'atelier studio init' を実行してください。",
        );
        process.exitCode = 1;
        return;
      }

      printSuccess(".atelier/ ディレクトリが存在します");

      // studio.yaml の読み込みと検証
      try {
        const configPath = path.join(atelierPath, STUDIO_CONFIG_FILE);
        const content = await readTextFile(configPath);
        const parsed = parseYaml(content) as Record<string, unknown>;

        if (parsed.studio) {
          printSuccess("studio.yaml が有効です");
        } else {
          printWarning("studio.yaml に 'studio' セクションがありません");
        }

        // Medium の可用性チェック
        const media = (parsed.media ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const mediaList = Object.entries(media).map(([name, config]) => ({
          name,
          command: (config.command as string) ?? name,
          args: ((config.args as string[]) ?? []) as readonly string[],
        }));

        if (mediaList.length > 0) {
          const checkUseCase = new MediumCheckUseCase();
          const results = await checkUseCase.execute(mediaList);

          printInfo("\nMedium 可用性:");
          const rows = results.map((r) => [
            r.name,
            r.command,
            r.available ? "✓" : "✗",
            r.error ?? "-",
          ]);
          printTable(["Name", "Command", "Available", "Note"], rows);
        } else {
          printWarning("Medium が設定されていません");
        }
      } catch (error) {
        printError(
          `studio.yaml の読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      }
    });

  return studio;
}
