/**
 * Queue Task Use Cases
 * タスクキューへの追加・一括実行を行うユースケース。
 */

import path from "node:path";
import { TaskQueue, createTask, type Task, type CreateTaskParams } from "../../domain/models/task.model.js";
import { TaskStoreAdapter } from "../../adapters/config/task-store.adapter.js";
import { CommissionRunUseCase, type ConfigPort, type VcsPort, type LoggerPort } from "./run-commission.use-case.js";
import type { MediumRegistry } from "../services/commission-runner.service.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { REQUIREMENTS_DIR } from "../../shared/constants.js";
import { listFiles, readTextFile } from "../../infrastructure/fs/file-system.js";

/**
 * QueueTaskUseCase
 * タスクをキューに追加する。
 */
export class QueueTaskUseCase {
  private readonly store: TaskStoreAdapter;

  constructor(projectPath: string) {
    this.store = new TaskStoreAdapter(projectPath);
  }

  /** タスクをキューに追加して永続化する */
  async execute(params: CreateTaskParams): Promise<Task> {
    const tasks = await this.store.load();
    const queue = new TaskQueue(tasks);
    const task = createTask(params);
    queue.add(task);
    await this.store.save(queue.list());
    return task;
  }

  /** タスク一覧を取得する */
  async list(): Promise<readonly Task[]> {
    const tasks = await this.store.load();
    return tasks;
  }

  /** タスクを削除する */
  async remove(id: string): Promise<boolean> {
    const tasks = await this.store.load();
    const queue = new TaskQueue(tasks);
    const removed = queue.remove(id);
    if (removed) {
      await this.store.save(queue.list());
    }
    return removed;
  }
}

/** 個別タスクの実行結果 */
export interface TaskRunDetail {
  readonly task: Task;
  readonly success: boolean;
  readonly branch?: string;
  readonly error?: string;
}

/** RunQueueUseCase の実行結果 */
export interface RunQueueResult {
  readonly completed: number;
  readonly failed: number;
  readonly details: readonly TaskRunDetail[];
}

/**
 * RunQueueUseCase
 * キュー内のタスクを順次または並列実行する。
 */
export class RunQueueUseCase {
  private readonly store: TaskStoreAdapter;
  private readonly configPort: ConfigPort;
  private readonly vcsPort: VcsPort;
  private readonly loggerPort: LoggerPort;
  private readonly mediumRegistry: MediumRegistry;
  private readonly eventBus: TypedEventEmitter<AtelierEvents>;

  constructor(
    projectPath: string,
    configPort: ConfigPort,
    vcsPort: VcsPort,
    loggerPort: LoggerPort,
    mediumRegistry: MediumRegistry,
    eventBus: TypedEventEmitter<AtelierEvents>,
  ) {
    this.store = new TaskStoreAdapter(projectPath);
    this.configPort = configPort;
    this.vcsPort = vcsPort;
    this.loggerPort = loggerPort;
    this.mediumRegistry = mediumRegistry;
    this.eventBus = eventBus;
  }

  /** 単一タスクを実行し結果を返す */
  private async executeOneTask(
    task: Task,
    projectPath: string,
    queue: TaskQueue,
  ): Promise<TaskRunDetail> {
    queue.markRunning(task.id);
    await this.store.save(queue.list());

    let branch: string | undefined;

    try {
      const commissionName = task.commission ?? "default";

      // 最新の要件定義を自動で読み込み、Canvas に注入する
      const initialCanvas: Record<string, string> = {};
      initialCanvas.requirements = task.description;
      const latestReq = await this.findLatestRequirements(projectPath);
      if (latestReq) {
        initialCanvas.requirements = `${latestReq}\n\n## 今回のタスク\n${task.description}`;
      }

      const useCase = new CommissionRunUseCase(
        this.configPort,
        this.vcsPort,
        this.loggerPort,
        this.mediumRegistry,
        this.eventBus,
      );
      const result = await useCase.execute(commissionName, projectPath, {
        dryRun: false,
        initialCanvas,
      });

      branch = result.runId ? `atelier/${result.runId}` : undefined;

      if (result.status === "completed") {
        queue.markCompleted(task.id);
        await this.store.save(queue.list());
        return { task, success: true, branch };
      } else {
        queue.markFailed(task.id);
        await this.store.save(queue.list());
        const errorMsg = result.errors.length > 0
          ? result.errors.map((e) => e.message).join("; ")
          : "Commission failed";
        return { task, success: false, branch, error: errorMsg };
      }
    } catch (error) {
      queue.markFailed(task.id);
      await this.store.save(queue.list());
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.loggerPort.error(
        `タスク '${task.id}' の実行に失敗: ${errorMsg}`,
      );
      return { task, success: false, branch, error: errorMsg };
    }
  }

  /**
   * .atelier/requirements/ から最新の要件定義ファイルを読み込む。
   */
  private async findLatestRequirements(projectPath: string): Promise<string | null> {
    try {
      const reqDir = path.join(resolveAtelierPath(projectPath), REQUIREMENTS_DIR);
      const files = await listFiles(reqDir, ".md");
      if (files.length === 0) return null;
      // ファイル名が日付+時刻なのでソートすれば最新が末尾
      const latest = files.sort().pop()!;
      return readTextFile(latest);
    } catch {
      return null;
    }
  }

  /**
   * セマフォベースの並列実行。
   * concurrency 個のスロットを管理し、空きスロットができたら次のタスクを投入する。
   */
  private async runWithConcurrency(
    pendingTasks: Task[],
    concurrency: number,
    projectPath: string,
    queue: TaskQueue,
  ): Promise<TaskRunDetail[]> {
    let running = 0;
    let index = 0;
    const results: TaskRunDetail[] = [];

    return new Promise<TaskRunDetail[]>((resolve) => {
      const next = (): void => {
        while (running < concurrency && index < pendingTasks.length) {
          const task = pendingTasks[index++]!;
          running++;
          this.executeOneTask(task, projectPath, queue)
            .then((detail) => {
              results.push(detail);
            })
            .catch((err) => {
              results.push({
                task,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            })
            .finally(() => {
              running--;
              next();
            });
        }
        if (running === 0 && index >= pendingTasks.length) {
          resolve(results);
        }
      };
      next();
    });
  }

  /** キュー内の全タスクを実行する（concurrency で並列数を制御） */
  async execute(
    projectPath: string,
    concurrency: number = 1,
  ): Promise<RunQueueResult> {
    const tasks = await this.store.load();
    const queue = new TaskQueue(tasks);

    // queued 状態のタスクをすべて取得
    const pendingTasks = queue.getNextN(Infinity);

    if (pendingTasks.length === 0) {
      return { completed: 0, failed: 0, details: [] };
    }

    const effectiveConcurrency = Math.max(1, Math.min(concurrency, pendingTasks.length));

    this.loggerPort.info(
      `${pendingTasks.length} 件のタスクを並列数 ${effectiveConcurrency} で実行開始`,
    );

    let details: TaskRunDetail[];

    if (effectiveConcurrency <= 1) {
      // 順次実行（後方互換）
      details = [];
      for (const task of pendingTasks) {
        const detail = await this.executeOneTask(task, projectPath, queue);
        details.push(detail);
      }
    } else {
      // 並列実行
      details = await this.runWithConcurrency(
        pendingTasks,
        effectiveConcurrency,
        projectPath,
        queue,
      );
    }

    const completed = details.filter((d) => d.success).length;
    const failed = details.filter((d) => !d.success).length;

    return { completed, failed, details };
  }
}
