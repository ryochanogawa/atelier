/**
 * CLI Entry Point
 * Commander.js プログラム定義。全コマンド登録。
 */

import { Command } from "commander";
import { CLI_NAME, CLI_VERSION } from "../shared/constants.js";
import { createCommissionCommand } from "./commands/commission.cmd.js";
import { createStudioCommand } from "./commands/studio.cmd.js";
import { createMediumCommand } from "./commands/medium.cmd.js";
import { createLogCommand } from "./commands/log.cmd.js";
import { createIssueCommand } from "./commands/issue.cmd.js";
import { createPipelineCommand } from "./commands/pipeline.cmd.js";
import { createInteractiveCommand } from "./commands/interactive.cmd.js";
import { createTaskCommand } from "./commands/task.cmd.js";
import { createBranchCommand } from "./commands/branch.cmd.js";
import { createTechniqueCommand } from "./commands/technique.cmd.js";
import { createRepertoireCommand } from "./commands/repertoire.cmd.js";
import { createReviewCommand } from "./commands/review.cmd.js";
import { createAnalyzeCommand } from "./commands/analyze.cmd.js";
import { createDocsCommand } from "./commands/docs.cmd.js";
import { createSuggestCommand } from "./commands/suggest.cmd.js";
import { createPromptCommand } from "./commands/prompt.cmd.js";
import { createRunCommand } from "./commands/run.cmd.js";
import { createCatalogCommand } from "./commands/catalog.cmd.js";
import { createWatchCommand } from "./commands/watch.cmd.js";
import { createSpecCommand } from "./commands/spec.cmd.js";
import { setOutputFormat } from "./output.js";

const program = new Command();

program
  .name(CLI_NAME)
  .description("ATELIER - AI Agent Orchestration CLI")
  .version(CLI_VERSION)
  .option("--json", "JSON 形式で出力", false)
  .hook("preAction", (_thisCommand, actionCommand) => {
    const opts = program.opts();
    if (opts.json) {
      setOutputFormat("json");
    }
  });

// コマンド登録
const runCmd = createRunCommand();
runCmd.name("run");
program.addCommand(runCmd, { isDefault: true });

program.addCommand(createCommissionCommand());
program.addCommand(createStudioCommand());
program.addCommand(createMediumCommand());
program.addCommand(createLogCommand());
program.addCommand(createIssueCommand());
program.addCommand(createPipelineCommand());
program.addCommand(createInteractiveCommand());
program.addCommand(createTaskCommand());
program.addCommand(createBranchCommand());
program.addCommand(createTechniqueCommand());
program.addCommand(createRepertoireCommand());
program.addCommand(createReviewCommand());
program.addCommand(createAnalyzeCommand());
program.addCommand(createDocsCommand());
program.addCommand(createSuggestCommand());
program.addCommand(createPromptCommand());
program.addCommand(createCatalogCommand());
program.addCommand(createWatchCommand());
program.addCommand(createSpecCommand());

program.parse(process.argv);
