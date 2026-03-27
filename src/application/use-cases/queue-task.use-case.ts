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

/**
 * RunQueueUseCase
 * キュー内のタスクを順次実行する。
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

  /** キュー内の全タスクを順次実行する */
  async execute(projectPath: string): Promise<{ completed: number; failed: number }> {
    const tasks = await this.store.load();
    const queue = new TaskQueue(tasks);

    let completed = 0;
    let failed = 0;

    let next = queue.getNext();
    while (next) {
      queue.markRunning(next.id);
      await this.store.save(queue.list());

      try {
        if (next.commission) {
          const useCase = new CommissionRunUseCase(
            this.configPort,
            this.vcsPort,
            this.loggerPort,
            this.mediumRegistry,
            this.eventBus,
          );
          const result = await useCase.execute(next.commission, projectPath, {
            dryRun: false,
          });

          if (result.status === "completed") {
            queue.markCompleted(next.id);
            completed++;
          } else {
            queue.markFailed(next.id);
            failed++;
          }
        } else {
          // commission が指定されていない場合はスキップ（完了扱い）
          this.loggerPort.warn(
            `タスク '${next.id}' に commission が指定されていません。スキップします。`,
          );
          queue.markCompleted(next.id);
          completed++;
        }
      } catch (error) {
        queue.markFailed(next.id);
        failed++;
        this.loggerPort.error(
          `タスク '${next.id}' の実行に失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      await this.store.save(queue.list());
      next = queue.getNext();
    }

    return { completed, failed };
  }
}
