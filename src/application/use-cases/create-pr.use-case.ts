/**
 * CreatePR Use Case
 * Commission 実行結果をもとに Pull Request を自動作成するユースケース。
 */

import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";
import type { RunResultDto } from "../dto/run-result.dto.js";
import type { LoggerPort } from "./run-commission.use-case.js";
import { formatDuration } from "../../shared/utils.js";

export interface CreatePRResult {
  readonly number: number;
  readonly url: string;
}

export class CreatePRUseCase {
  constructor(
    private readonly pullRequest: PullRequestPort,
    private readonly loggerPort: LoggerPort,
  ) {}

  /**
   * 実行結果からPRタイトル・本文を自動生成し、PR を作成する。
   */
  async execute(
    runResult: RunResultDto,
    options: { base: string; head: string },
  ): Promise<CreatePRResult> {
    this.loggerPort.info(`PR を作成中... (base: ${options.base}, head: ${options.head})`);

    const title = this.buildTitle(runResult);
    const body = this.buildBody(runResult);

    const pr = await this.pullRequest.createPR({
      title,
      body,
      base: options.base,
      head: options.head,
    });

    this.loggerPort.info(`PR #${pr.number} を作成しました: ${pr.url}`);

    return { number: pr.number, url: pr.url };
  }

  /**
   * PR タイトルを生成する。
   */
  private buildTitle(result: RunResultDto): string {
    return `atelier: ${result.commissionName} (${result.runId})`;
  }

  /**
   * PR 本文を生成する。Stroke 実行履歴を含める。
   */
  private buildBody(result: RunResultDto): string {
    const statusEmoji = result.status === "completed" ? "✅" : "⚠️";

    const lines = [
      `## ${statusEmoji} ATELIER 実行サマリ`,
      "",
      `| 項目 | 値 |`,
      `| --- | --- |`,
      `| Commission | ${result.commissionName} |`,
      `| Status | ${result.status} |`,
      `| Strokes | ${result.strokesExecuted} / ${result.strokesTotal} |`,
      `| Duration | ${formatDuration(result.duration)} |`,
      `| Run ID | \`${result.runId}\` |`,
      `| Started | ${result.startedAt} |`,
      `| Completed | ${result.completedAt} |`,
    ];

    if (result.errors.length > 0) {
      lines.push("", "### Errors");
      for (const err of result.errors) {
        lines.push(`- **${err.strokeName}**: ${err.message}`);
      }
    }

    lines.push("", "---", "*このPRは ATELIER により自動生成されました。*");

    return lines.join("\n");
  }
}
