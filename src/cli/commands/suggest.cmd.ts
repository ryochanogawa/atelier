/**
 * Suggest Commands
 * atelier suggest - タスク内容からPalette/Commission提案、プロンプト強化。
 */

import { Command } from "commander";
import { COLORS } from "../theme.js";
import { IntentEnhancerService } from "../../domain/services/intent-enhancer.service.js";
import { printSuccess, printInfo, printWarning, printTable } from "../output.js";

export function createSuggestCommand(): Command {
  const suggest = new Command("suggest")
    .description("タスク内容から最適なPalette/Commissionを提案、またはプロンプトを強化する");

  /**
   * atelier suggest palette <description>
   */
  suggest
    .command("palette <description>")
    .description("タスク内容からビルトインPaletteを提案する")
    .action((description: string) => {
      const enhancer = new IntentEnhancerService();
      const suggestions = enhancer.suggestPalette(description);

      if (suggestions.length === 0) {
        printWarning("該当するPaletteが見つかりませんでした。");
        return;
      }

      printSuccess("推奨Palette:");
      console.log();

      const rows = suggestions.map((s) => [
        s.name,
        `${Math.round(s.score * 100)}%`,
        s.description,
        s.reason,
      ]);

      printTable(["Name", "Score", "Description", "Reason"], rows);
      console.log();

      const best = suggestions[0];
      printInfo(
        `推奨: ${COLORS.accent.bold(best.name)} (スコア: ${Math.round(best.score * 100)}%)`,
      );
      printInfo(
        `使用例: ${COLORS.muted(`atelier commission run --palette ${best.name}`)}`,
      );
    });

  /**
   * atelier suggest commission <description>
   */
  suggest
    .command("commission <description>")
    .description("タスク内容からビルトインCommissionを提案する")
    .action((description: string) => {
      const enhancer = new IntentEnhancerService();
      const suggestions = enhancer.suggestCommission(description);

      if (suggestions.length === 0) {
        printWarning("該当するCommissionが見つかりませんでした。");
        return;
      }

      printSuccess("推奨Commission:");
      console.log();

      const rows = suggestions.map((s) => [
        s.name,
        `${Math.round(s.score * 100)}%`,
        s.description,
        s.reason,
      ]);

      printTable(["Name", "Score", "Description", "Reason"], rows);
      console.log();

      const best = suggestions[0];
      printInfo(
        `推奨: ${COLORS.accent.bold(best.name)} (スコア: ${Math.round(best.score * 100)}%)`,
      );
      printInfo(
        `使用例: ${COLORS.muted(`atelier commission run ${best.name}`)}`,
      );
    });

  /**
   * atelier suggest enhance <prompt>
   */
  suggest
    .command("enhance <prompt>")
    .description("プロンプトを自動強化する")
    .action((prompt: string) => {
      const enhancer = new IntentEnhancerService();
      const result = enhancer.enhance(prompt);

      console.log();
      printInfo(`信頼度スコア: ${Math.round(result.confidenceScore * 100)}%`);
      console.log();

      if (result.addedContexts.length === 0) {
        printSuccess(
          "プロンプトは十分に具体的です。追加の補完は不要です。",
        );
        console.log();
        console.log(COLORS.muted("--- 元のプロンプト ---"));
        console.log(result.original);
        return;
      }

      printWarning(
        `${result.addedContexts.length}件の観点が補完されました:`,
      );
      console.log();

      for (const ctx of result.addedContexts) {
        console.log(
          `  ${COLORS.warning("+")} [${COLORS.accent.bold(ctx.category)}] ${ctx.content}`,
        );
        console.log(`    ${COLORS.muted(ctx.reason)}`);
      }

      console.log();
      console.log(COLORS.muted("--- 強化済みプロンプト ---"));
      console.log(result.enhanced);
      console.log();
    });

  return suggest;
}
