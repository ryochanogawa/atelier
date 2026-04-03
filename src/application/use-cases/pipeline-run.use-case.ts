/**
 * PipelineRun Use Case
 * CI/CD 環境での Commission 実行 + PR 作成を行うユースケース。
 */

import { CommissionRunUseCase } from "./run-commission.use-case.js";
import { CreatePRUseCase } from "./create-pr.use-case.js";
import type { ConfigPort, VcsPort, LoggerPort } from "./run-commission.use-case.js";
import type { MediumExecutor } from "../ports/medium-executor.port.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";
import type { RunResultDto } from "../dto/run-result.dto.js";
import type { PipelineConfig } from "../../shared/types.js";
import {
  buildTemplateVars,
  buildCommitMessage,
  buildPRTitle,
  buildPRBody,
  getBranchPrefix,
} from "../../shared/pipeline-template.js";

export interface PipelineRunResult {
  readonly runResult: RunResultDto;
  readonly pr?: { number: number; url: string };
}

export class PipelineRunUseCase {
  private readonly commissionRunUseCase: CommissionRunUseCase;
  private readonly createPRUseCase: CreatePRUseCase | undefined;

  constructor(
    private readonly configPort: ConfigPort,
    private readonly vcsPort: VcsPort,
    private readonly loggerPort: LoggerPort,
    private readonly mediumExecutor: MediumExecutor,
    private readonly eventBus: TypedEventEmitter<AtelierEvents>,
    private readonly pullRequest?: PullRequestPort,
  ) {
    this.commissionRunUseCase = new CommissionRunUseCase(
      configPort,
      vcsPort,
      loggerPort,
      mediumExecutor,
      eventBus,
    );

    if (pullRequest) {
      this.createPRUseCase = new CreatePRUseCase(pullRequest, loggerPort);
    }
  }

  /**
   * Commission 実行 → PR 作成 → 結果を JSON 出力。
   */
  async execute(
    commissionName: string,
    projectPath: string,
    options: {
      autoPR: boolean;
      base?: string;
      head?: string;
      medium?: string;
      task?: string;
      pipelineConfig?: PipelineConfig;
    },
  ): Promise<PipelineRunResult> {
    this.loggerPort.info(`Pipeline 実行開始: ${commissionName}`);

    // 1. Commission 実行
    const runResult = await this.commissionRunUseCase.execute(
      commissionName,
      projectPath,
      {
        dryRun: false,
        medium: options.medium,
      },
    );

    // 2. 失敗した場合は PR 作成をスキップ
    if (runResult.status === "failed") {
      this.loggerPort.error(`Commission 失敗: ${commissionName}`);
      return { runResult };
    }

    // 3. auto-pr が有効な場合は PR 作成
    let pr: { number: number; url: string } | undefined;
    if (options.autoPR && this.createPRUseCase) {
      try {
        const base = options.base ?? "main";
        const branchPrefix = getBranchPrefix(options.pipelineConfig);
        const head = options.head ?? `${branchPrefix}${runResult.runId}`;

        // テンプレート変数を構築
        const templateVars = buildTemplateVars({
          task: options.task,
          commission: commissionName,
          branch: head,
        });

        // テンプレートからタイトル・本文を生成
        const templateTitle = buildPRTitle(templateVars, options.pipelineConfig);
        const templateBody = buildPRBody(templateVars, options.pipelineConfig);

        pr = await this.createPRUseCase.execute(runResult, {
          base,
          head,
          taskDescription: options.task,
          templateTitle,
          templateBody: templateBody ?? undefined,
        });
      } catch (error) {
        this.loggerPort.warn(
          `PR 作成に失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.loggerPort.info(`Pipeline 完了: ${commissionName}`);

    return { runResult, pr };
  }
}
