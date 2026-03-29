/**
 * Task Store Adapter
 * .atelier/tasks.yaml の読み書きを行うアダプター。
 */

import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  readTextFile,
  writeTextFile,
  fileExists,
} from "../../infrastructure/fs/file-system.js";
import type { Task } from "../../domain/models/task.model.js";

const TASKS_FILE = "tasks.yaml";

/** YAML上のタスク表現 */
interface TaskYaml {
  id: string;
  description: string;
  commission?: string;
  requirements_id?: number;
  status: string;
  created_at: string;
  source: string;
}

/**
 * タスクストアアダプター
 * .atelier/tasks.yaml に対してタスクの永続化を行う。
 */
export class TaskStoreAdapter {
  private readonly filePath: string;

  constructor(projectPath: string) {
    this.filePath = path.join(resolveAtelierPath(projectPath), TASKS_FILE);
  }

  /** 全タスクを読み込む */
  async load(): Promise<Task[]> {
    if (!(await fileExists(this.filePath))) {
      return [];
    }

    const content = await readTextFile(this.filePath);
    const parsed = parseYaml(content) as { tasks?: TaskYaml[] } | null;

    if (!parsed?.tasks || !Array.isArray(parsed.tasks)) {
      return [];
    }

    return parsed.tasks.map((t) => this.fromYaml(t));
  }

  /** 全タスクを保存する */
  async save(tasks: readonly Task[]): Promise<void> {
    const yamlTasks = tasks.map((t) => this.toYaml(t));
    const content = stringifyYaml({ tasks: yamlTasks }, { indent: 2 });
    await writeTextFile(this.filePath, content);
  }

  private toYaml(task: Task): TaskYaml {
    return {
      id: task.id,
      description: task.description,
      ...(task.commission ? { commission: task.commission } : {}),
      ...(task.requirementsId != null ? { requirements_id: task.requirementsId } : {}),
      status: task.status,
      created_at: task.createdAt,
      source: task.source,
    };
  }

  private fromYaml(yaml: TaskYaml): Task {
    return {
      id: yaml.id,
      description: yaml.description,
      commission: yaml.commission,
      requirementsId: yaml.requirements_id,
      status: yaml.status as Task["status"],
      createdAt: yaml.created_at,
      source: yaml.source as Task["source"],
    };
  }
}
