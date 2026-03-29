/**
 * RunCommission Use Case
 * Commission 実行のメインフロー。
 */

import path from "node:path";
import { parse as parseYaml } from "yaml";
import { CommissionRunnerService, type MediumRegistry } from "../services/commission-runner.service.js";
import { createRunResultDto, type RunResultDto } from "../dto/run-result.dto.js";
import { generateRunId, resolveAtelierPath, timestamp } from "../../shared/utils.js";
import { COMMISSIONS_DIR, STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import type { CommissionDefinition, RunOptions, StudioConfig, MediumConfig } from "../../shared/types.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, fileExists, writeTextFile } from "../../infrastructure/fs/file-system.js";
import { CommissionError, ConfigError } from "../../domain/errors/atelier-error.js";

/** Port: 設定の読み込み */
export interface ConfigPort {
  loadStudioConfig(projectPath: string): Promise<StudioConfig>;
  loadMediaConfig(projectPath: string): Promise<Record<string, MediumConfig>>;
}

/** Port: VCS 操作 */
export interface VcsPort {
  createWorktree(basePath: string, branchName: string): Promise<string>;
  removeWorktree(worktreePath: string): Promise<void>;
  commitAll(cwd: string, message: string): Promise<void>;
}

/** Port: ログ記録 */
export interface LoggerPort {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export class CommissionRunUseCase {
  constructor(
    private readonly configPort: ConfigPort,
    private readonly vcsPort: VcsPort,
    private readonly loggerPort: LoggerPort,
    private readonly mediumRegistry: MediumRegistry,
    private readonly eventBus: TypedEventEmitter<AtelierEvents>,
  ) {}

  async execute(
    commissionName: string,
    projectPath: string,
    options: RunOptions,
  ): Promise<RunResultDto> {
    const runId = generateRunId();
    const startedAt = timestamp();
    const startTime = Date.now();

    this.loggerPort.info(`Commission 実行開始: ${commissionName}`, { runId });

    this.eventBus.emit("commission:start", {
      runId,
      commissionName,
    });

    try {
      // 1. Commission YAML を読み込み・バリデーション
      const commission = await this.loadCommission(commissionName, projectPath);

      // 2. Studio 設定の読み込み
      const studioConfig = await this.configPort.loadStudioConfig(projectPath);

      // 3. Git worktree 作成（dry-run 以外）
      let worktreePath = projectPath;
      if (!options.dryRun) {
        try {
          worktreePath = await this.vcsPort.createWorktree(
            projectPath,
            `atelier/${runId}`,
          );
          this.loggerPort.debug(`Worktree 作成: ${worktreePath}`);
        } catch {
          this.loggerPort.warn(
            "Worktree 作成をスキップ（Git リポジトリではない可能性）",
          );
          worktreePath = projectPath;
        }
      }

      // 4. CommissionRunnerService で実行
      const runner = new CommissionRunnerService({
        eventBus: this.eventBus,
        mediumRegistry: this.mediumRegistry,
        defaultMedium: options.medium ?? studioConfig.defaultMedium,
        cwd: worktreePath,
        projectPath,
      });

      const result = await runner.execute(commission, runId, options);
      const duration = Date.now() - startTime;
      const completedAt = timestamp();

      // 5. ログに記録
      const runResult = createRunResultDto({
        runId,
        commissionName,
        status: result.status,
        strokesExecuted: result.strokesExecuted,
        strokesTotal: commission.strokes.length,
        duration,
        startedAt,
        completedAt,
        errors: result.errors,
      });

      await this.saveRunLog(projectPath, runResult);

      // 6. Worktree 後処理 — コミットのみ行い、worktree は保持する（takt 方式）
      if (!options.dryRun && worktreePath !== projectPath) {
        try {
          if (result.status === "completed") {
            await this.vcsPort.commitAll(
              worktreePath,
              `atelier: ${commissionName} (${runId})`,
            );
          }
          // removeWorktree は呼ばない — worktree を保持する。
          // ユーザーが atelier branch delete/merge で明示的に操作する。
          this.loggerPort.info(
            `Worktree を保持: ${worktreePath} (branch: atelier/${runId})`,
          );
        } catch (error) {
          this.loggerPort.warn(
            `Worktree 後処理に失敗: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.eventBus.emit("commission:complete", {
        runId,
        commissionName,
        duration,
      });

      this.loggerPort.info(
        `Commission 完了: ${commissionName} (${result.status})`,
        { runId, duration },
      );

      return runResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.eventBus.emit("commission:fail", {
        runId,
        commissionName,
        error: errorMessage,
      });

      this.loggerPort.error(`Commission 失敗: ${commissionName}`, {
        runId,
        error: errorMessage,
      });

      return createRunResultDto({
        runId,
        commissionName,
        status: "failed",
        strokesExecuted: 0,
        strokesTotal: 0,
        duration,
        startedAt,
        completedAt: timestamp(),
        errors: [
          {
            strokeName: "unknown",
            message: errorMessage,
            timestamp: timestamp(),
          },
        ],
      });
    }
  }

  private async loadCommission(
    name: string,
    projectPath: string,
  ): Promise<CommissionDefinition> {
    const atelierPath = resolveAtelierPath(projectPath);
    const commissionPath = path.join(
      atelierPath,
      COMMISSIONS_DIR,
      `${name}.yaml`,
    );

    if (!(await fileExists(commissionPath))) {
      throw new CommissionError(
        name,
        `Commission ファイルが見つかりません: ${commissionPath}`,
      );
    }

    const content = await readTextFile(commissionPath);
    const parsed = parseYaml(content) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      throw new CommissionError(name, "無効な Commission YAML です");
    }

    const commission = parsed as unknown as CommissionDefinition;

    if (!commission.name) {
      throw new CommissionError(name, "Commission に name が必要です");
    }

    if (!commission.strokes || commission.strokes.length === 0) {
      throw new CommissionError(
        name,
        "Commission に最低1つの stroke が必要です",
      );
    }

    return commission;
  }

  private async saveRunLog(
    projectPath: string,
    result: RunResultDto,
  ): Promise<void> {
    const logsDir = path.join(resolveAtelierPath(projectPath), "logs");
    const logPath = path.join(logsDir, `${result.runId}.json`);
    await writeTextFile(logPath, JSON.stringify(result, null, 2));
  }
}
