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
  readonly skipped?: boolean;
}

export class CreatePRUseCase {
  constructor(
    private readonly pullRequest: PullRequestPort,
    private readonly loggerPort: LoggerPort,
  ) {}

  /**
   * 実行結果からPRタイトル・本文を自動生成し、PR を作成する。
   * PR 作成前に git push origin <branch> を実行する。
   * 既存PRがあればスキップする。
   */
  async execute(
    runResult: RunResultDto,
    options: {
      base: string;
      head: string;
      draft?: boolean;
      taskDescription?: string;
      /** テンプレートから生成済みの PR タイトル */
      templateTitle?: string;
      /** テンプレートから生成済みの PR 本文 */
      templateBody?: string;
    },
  ): Promise<CreatePRResult> {
    this.loggerPort.info(`PR を作成中... (base: ${options.base}, head: ${options.head})`);

    // 既存PRチェック — 存在する場合はコメントを追加
    const existingPRs = await this.pullRequest.listPRs({ head: options.head });
    if (existingPRs.length > 0) {
      const existing = existingPRs[0]!;
      this.loggerPort.info(`既存の PR #${existing.number} が見つかりました。コメントを追加します: ${existing.url}`);

      const commentBody = options.templateBody ?? this.buildBody(runResult);
      await this.pullRequest.commentOnPr(existing.number, commentBody);

      return { number: existing.number, url: existing.url, skipped: true };
    }

    // リモートへプッシュ
    this.loggerPort.info(`ブランチ '${options.head}' をリモートへプッシュ中...`);
    await this.pullRequest.pushBranch(options.head);

    const title = options.templateTitle ?? this.buildTitle(runResult, options.taskDescription);
    const body = options.templateBody ?? this.buildBody(runResult);

    const pr = await this.pullRequest.createPR({
      title,
      body,
      base: options.base,
      head: options.head,
      draft: options.draft,
    });

    this.loggerPort.info(`PR #${pr.number} を作成しました: ${pr.url}`);

    return { number: pr.number, url: pr.url };
  }

  /**
   * PR タイトルを生成する。
   * taskDescription があればそれを使い、100文字で切り詰める。
   */
  private buildTitle(result: RunResultDto, taskDescription?: string): string {
    if (taskDescription) {
      const truncated = taskDescription.length > 100
        ? taskDescription.slice(0, 100) + "..."
        : taskDescription;
      return truncated;
    }
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
