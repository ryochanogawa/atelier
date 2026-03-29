/**
 * Queue Task Use Cases
 * タスクキューへの追加・一括実行を行うユースケース。
 */

import { TaskQueue, createTask, type Task, type CreateTaskParams } from "../../domain/models/task.model.js";
import { TaskStoreAdapter } from "../../adapters/config/task-store.adapter.js";
import { CommissionRunUseCase, type ConfigPort, type VcsPort, type LoggerPort } from "./run-commission.use-case.js";
import type { MediumRegistry } from "../services/commission-runner.service.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";

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
      if (task.commission) {
        const useCase = new CommissionRunUseCase(
          this.configPort,
          this.vcsPort,
          this.loggerPort,
          this.mediumRegistry,
          this.eventBus,
        );
        const result = await useCase.execute(task.commission, projectPath, {
          dryRun: false,
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
      } else {
        // commission が指定されていない場合はスキップ（完了扱い）
        this.loggerPort.warn(
          `タスク '${task.id}' に commission が指定されていません。スキップします。`,
        );
        queue.markCompleted(task.id);
        await this.store.save(queue.list());
        return { task, success: true };
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
