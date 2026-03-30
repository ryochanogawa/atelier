/**
 * Watch / Pipeline コマンド関連テスト
 *
 * CLIコマンド自体は外部依存（ファイルシステム、subprocess、git）が多いため、
 * ここではコマンドが依存するドメインモデル（TaskQueue）のwatch/pipeline固有の
 * 利用パターンと、コマンドのCommander定義が正しいことを検証する。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TaskQueue, createTask } from "../../../src/domain/models/task.model.js";
import type { Task } from "../../../src/domain/models/task.model.js";
import { createWatchCommand } from "../../../src/cli/commands/watch.cmd.js";
import { createPipelineCommand } from "../../../src/cli/commands/pipeline.cmd.js";

describe("TaskQueue (watchで使用されるパターン)", () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe("タスク検出ロジック", () => {
    it("queued状態のタスクのみがgetNextで返される", () => {
      const task1 = createTask({ description: "タスク1" });
      const task2 = createTask({ description: "タスク2" });
      queue.add(task1);
      queue.add(task2);

      // 最初のqueuedタスクが返る
      const next = queue.getNext();
      expect(next).toBeDefined();
      expect(next!.description).toBe("タスク1");
      expect(next!.status).toBe("queued");
    });

    it("running状態のタスクはスキップされる", () => {
      const task1 = createTask({ description: "タスク1" });
      const task2 = createTask({ description: "タスク2" });
      queue.add(task1);
      queue.add(task2);

      queue.markRunning(task1.id);
      const next = queue.getNext();
      expect(next).toBeDefined();
      expect(next!.description).toBe("タスク2");
    });

    it("全タスクがcompletedの場合はundefinedが返る", () => {
      const task1 = createTask({ description: "タスク1" });
      queue.add(task1);
      queue.markCompleted(task1.id);

      expect(queue.getNext()).toBeUndefined();
    });

    it("failed状態のタスクはスキップされる", () => {
      const task1 = createTask({ description: "タスク1" });
      const task2 = createTask({ description: "タスク2" });
      queue.add(task1);
      queue.add(task2);

      queue.markFailed(task1.id);
      const next = queue.getNext();
      expect(next).toBeDefined();
      expect(next!.description).toBe("タスク2");
    });

    it("空のキューではundefinedが返る", () => {
      expect(queue.getNext()).toBeUndefined();
    });
  });

  describe("エラー処理パターン（watchのexecuteOneTask相当）", () => {
    it("タスク失敗時にmarkFailedで状態遷移しキューは継続可能", () => {
      const task1 = createTask({ description: "失敗タスク" });
      const task2 = createTask({ description: "次のタスク" });
      queue.add(task1);
      queue.add(task2);

      // タスク1がrunning → failedに遷移
      queue.markRunning(task1.id);
      queue.markFailed(task1.id);

      // タスク1はfailedだが、タスク2はまだqueuedで取得可能
      const next = queue.getNext();
      expect(next).toBeDefined();
      expect(next!.description).toBe("次のタスク");
      expect(next!.status).toBe("queued");

      // タスク1の状態確認
      const allTasks = queue.list();
      const failedTask = allTasks.find((t) => t.id === task1.id);
      expect(failedTask!.status).toBe("failed");
    });

    it("markRunning → markCompleted の正常フロー", () => {
      const task = createTask({ description: "正常タスク" });
      queue.add(task);

      queue.markRunning(task.id);
      expect(queue.list()[0].status).toBe("running");

      queue.markCompleted(task.id);
      expect(queue.list()[0].status).toBe("completed");

      // 完了後は次のタスクなし
      expect(queue.getNext()).toBeUndefined();
    });
  });

  describe("タスク初期化", () => {
    it("createTaskはデフォルトでqueued/manualを設定する", () => {
      const task = createTask({ description: "テスト" });
      expect(task.status).toBe("queued");
      expect(task.source).toBe("manual");
      expect(task.id).toHaveLength(8);
      expect(task.createdAt).toBeTruthy();
    });

    it("commission付きタスクが作成できる", () => {
      const task = createTask({
        description: "Commission付き",
        commission: "my-commission",
      });
      expect(task.commission).toBe("my-commission");
    });

    it("sourceを指定できる", () => {
      const task = createTask({
        description: "Issue由来",
        source: "issue",
      });
      expect(task.source).toBe("issue");
    });

    it("初期タスク配列からTaskQueueを構築できる", () => {
      const tasks: Task[] = [
        createTask({ description: "タスクA" }),
        createTask({ description: "タスクB" }),
        createTask({ description: "タスクC" }),
      ];
      const q = new TaskQueue(tasks);
      expect(q.list()).toHaveLength(3);
    });
  });
});

describe("createWatchCommand", () => {
  it("watchコマンドが正しく定義されている", () => {
    const cmd = createWatchCommand();
    expect(cmd.name()).toBe("watch");
    expect(cmd.description()).toContain("タスクキュー");
  });

  it("--intervalオプションが定義されている", () => {
    const cmd = createWatchCommand();
    const intervalOption = cmd.options.find(
      (o) => o.long === "--interval",
    );
    expect(intervalOption).toBeDefined();
    expect(intervalOption!.defaultValue).toBe("2000");
  });
});

describe("createPipelineCommand", () => {
  it("pipelineコマンドが正しく定義されている", () => {
    const cmd = createPipelineCommand();
    expect(cmd.name()).toBe("pipeline");
    expect(cmd.description()).toContain("CI/CD");
  });

  it("runサブコマンドが存在する", () => {
    const cmd = createPipelineCommand();
    const runCmd = cmd.commands.find((c) => c.name() === "run");
    expect(runCmd).toBeDefined();
  });

  it("runサブコマンドに必要なオプションが定義されている", () => {
    const cmd = createPipelineCommand();
    const runCmd = cmd.commands.find((c) => c.name() === "run")!;
    const optionNames = runCmd.options.map((o) => o.long);

    expect(optionNames).toContain("--auto-pr");
    expect(optionNames).toContain("--base");
    expect(optionNames).toContain("--head");
    expect(optionNames).toContain("--medium");
    expect(optionNames).toContain("--task");
    expect(optionNames).toContain("--json");
  });

  it("--baseオプションのデフォルト値はmain", () => {
    const cmd = createPipelineCommand();
    const runCmd = cmd.commands.find((c) => c.name() === "run")!;
    const baseOption = runCmd.options.find((o) => o.long === "--base");
    expect(baseOption!.defaultValue).toBe("main");
  });

  it("--auto-prオプションのデフォルト値はfalse", () => {
    const cmd = createPipelineCommand();
    const runCmd = cmd.commands.find((c) => c.name() === "run")!;
    const autoPrOption = runCmd.options.find((o) => o.long === "--auto-pr");
    expect(autoPrOption!.defaultValue).toBe(false);
  });
});
