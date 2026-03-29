/**
 * Task Model
 * タスクキューのエンティティ。タスクの状態管理とキュー操作を提供する。
 */

import { nanoid } from "nanoid";

/** タスクのステータス */
export type TaskStatus = "queued" | "running" | "completed" | "failed";

/** タスクの作成元 */
export type TaskSource = "manual" | "issue" | "interactive";

/** タスク定義 */
export interface Task {
  readonly id: string;
  readonly description: string;
  readonly commission?: string;
  readonly requirementsId?: number;
  status: TaskStatus;
  readonly createdAt: string;
  readonly source: TaskSource;
}

/** タスク作成パラメータ */
export interface CreateTaskParams {
  readonly description: string;
  readonly commission?: string;
  readonly requirementsId?: number;
  readonly source?: TaskSource;
}

/**
 * タスクを新規作成する。
 */
export function createTask(params: CreateTaskParams): Task {
  return {
    id: nanoid(8),
    description: params.description,
    commission: params.commission,
    requirementsId: params.requirementsId,
    status: "queued",
    createdAt: new Date().toISOString(),
    source: params.source ?? "manual",
  };
}

/**
 * TaskQueue
 * インメモリのタスクキュー。追加・削除・状態遷移を管理する。
 */
export class TaskQueue {
  private tasks: Task[] = [];

  constructor(initialTasks: Task[] = []) {
    this.tasks = [...initialTasks];
  }

  /** タスクをキューに追加する */
  add(task: Task): void {
    this.tasks.push(task);
  }

  /** IDでタスクを削除する */
  remove(id: string): boolean {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  /** 全タスクを返す */
  list(): readonly Task[] {
    return [...this.tasks];
  }

  /** キュー内の次のタスクを取得する */
  getNext(): Task | undefined {
    return this.tasks.find((t) => t.status === "queued");
  }

  /** キュー内の次の N 個のタスクを取得する */
  getNextN(n: number): Task[] {
    const result: Task[] = [];
    for (const t of this.tasks) {
      if (result.length >= n) break;
      if (t.status === "queued") result.push(t);
    }
    return result;
  }

  /** タスクを running に遷移する */
  markRunning(id: string): void {
    const task = this.findById(id);
    if (task) task.status = "running";
  }

  /** タスクを completed に遷移する */
  markCompleted(id: string): void {
    const task = this.findById(id);
    if (task) task.status = "completed";
  }

  /** タスクを failed に遷移する */
  markFailed(id: string): void {
    const task = this.findById(id);
    if (task) task.status = "failed";
  }

  /** IDでタスクを検索する */
  private findById(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }
}
