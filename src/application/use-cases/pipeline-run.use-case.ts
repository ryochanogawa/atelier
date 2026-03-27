/**
 * PipelineRun Use Case
 * CI/CD 環境での Commission 実行 + PR 作成を行うユースケース。
 */

import { CommissionRunUseCase } from "./run-commission.use-case.js";
import { CreatePRUseCase } from "./create-pr.use-case.js";
import type { ConfigPort, VcsPort, LoggerPort } from "./run-commission.use-case.js";
import type { MediumRegistry } from "../services/commission-runner.service.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";
import type { RunResultDto } from "../dto/run-result.dto.js";

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
    private readonly mediumRegistry: MediumRegistry,
    private readonly eventBus: TypedEventEmitter<AtelierEvents>,
    private readonly pullRequest?: PullRequestPort,
  ) {
    this.commissionRunUseCase = new CommissionRunUseCase(
      configPort,
      vcsPort,
      loggerPort,
      mediumRegistry,
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
        const head = options.head ?? `atelier/${runResult.runId}`;

        pr = await this.createPRUseCase.execute(runResult, { base, head });
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
