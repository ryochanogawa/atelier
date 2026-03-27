/**
 * Medium Commands
 * atelier medium list/check
 */

import { Command } from "commander";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { MediumCheckUseCase } from "../../application/use-cases/check-medium.use-case.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import { readTextFile } from "../../infrastructure/fs/file-system.js";
import {
  printTable,
  printError,
  printWarning,
  printInfo,
} from "../output.js";

async function loadMediaFromConfig(
  projectPath: string,
): Promise<{ name: string; command: string; args: readonly string[] }[]> {
  const configPath = path.join(
    resolveAtelierPath(projectPath),
    STUDIO_CONFIG_FILE,
  );
  const content = await readTextFile(configPath);
  const parsed = parseYaml(content) as Record<string, unknown>;
  const media = (parsed.media ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

  return Object.entries(media).map(([name, config]) => ({
    name,
    command: (config.command as string) ?? name,
    args: ((config.args as string[]) ?? []) as readonly string[],
  }));
}

export function createMediumCommand(): Command {
  const medium = new Command("medium")
    .description("Medium（AIプロバイダー）の管理");

  // medium list
  medium
    .command("list")
    .description("設定済み Medium の一覧表示")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const mediaList = await loadMediaFromConfig(projectPath);

        if (mediaList.length === 0) {
          printWarning("Medium が設定されていません");
          return;
        }

        const rows = mediaList.map((m) => [
          m.name,
          m.command,
          m.args.join(" "),
        ]);
        printTable(["Name", "Command", "Args"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  // medium check
  medium
    .command("check")
    .description("全 Medium の可用性をチェック")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const mediaList = await loadMediaFromConfig(projectPath);

        if (mediaList.length === 0) {
          printWarning("Medium が設定されていません");
          return;
        }

        const useCase = new MediumCheckUseCase();
        const results = await useCase.execute(mediaList);

        printInfo("Medium 可用性チェック:");
        const rows = results.map((r) => [
          r.name,
          r.command,
          r.available ? "✓ 利用可能" : "✗ 利用不可",
          r.error ?? "-",
        ]);
        printTable(["Name", "Command", "Status", "Note"], rows);
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return medium;
}
