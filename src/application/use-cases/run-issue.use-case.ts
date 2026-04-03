/**
 * RunIssue Use Case
 * GitHub Issue をベースに Commission を実行するユースケース。
 */

import type { Issue, IssueTrackerPort } from "../../domain/ports/issue-tracker.port.js";
import { CommissionRunUseCase } from "./run-commission.use-case.js";
import type { ConfigPort, VcsPort, LoggerPort } from "./run-commission.use-case.js";
import type { MediumExecutor } from "../ports/medium-executor.port.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import type { RunResultDto } from "../dto/run-result.dto.js";
import { formatDuration } from "../../shared/utils.js";

export class RunIssueUseCase {
  private readonly commissionRunUseCase: CommissionRunUseCase;

  constructor(
    private readonly issueTracker: IssueTrackerPort,
    private readonly configPort: ConfigPort,
    private readonly vcsPort: VcsPort,
    private readonly loggerPort: LoggerPort,
    private readonly mediumExecutor: MediumExecutor,
    private readonly eventBus: TypedEventEmitter<AtelierEvents>,
  ) {
    this.commissionRunUseCase = new CommissionRunUseCase(
      configPort,
      vcsPort,
      loggerPort,
      mediumExecutor,
      eventBus,
    );
  }

  /**
   * Issue を取得し、Commission を実行して結果を Issue にコメントする。
   */
  async execute(
    owner: string,
    repo: string,
    issueNumber: number,
    commissionName: string,
    projectPath: string,
  ): Promise<RunResultDto> {
    this.loggerPort.info(`Issue #${issueNumber} を取得中...`);

    // 1. Issue 取得
    const issue = await this.issueTracker.getIssue(owner, repo, issueNumber);
    this.loggerPort.info(`Issue 取得完了: ${issue.title}`);

    // 2. Commission 実行
    const result = await this.commissionRunUseCase.execute(
      commissionName,
      projectPath,
      { dryRun: false },
    );

    // 3. 結果を Issue にコメント
    const comment = this.buildResultComment(issue, result);
    await this.issueTracker.addComment(owner, repo, issueNumber, comment);

    this.loggerPort.info(`Issue #${issueNumber} に結果をコメントしました`);

    return result;
  }

  /**
   * 実行結果からコメント本文を生成する。
   */
  private buildResultComment(issue: Issue, result: RunResultDto): string {
    const statusEmoji = result.status === "completed" ? "✅" : "❌";
    const lines = [
      `## ${statusEmoji} ATELIER 実行結果`,
      "",
      `- **Commission**: ${result.commissionName}`,
      `- **Status**: ${result.status}`,
      `- **Strokes**: ${result.strokesExecuted} / ${result.strokesTotal}`,
      `- **Duration**: ${formatDuration(result.duration)}`,
      `- **Run ID**: \`${result.runId}\``,
    ];

    if (result.errors.length > 0) {
      lines.push("", "### Errors");
      for (const err of result.errors) {
        lines.push(`- **${err.strokeName}**: ${err.message}`);
      }
    }

    return lines.join("\n");
  }
}
