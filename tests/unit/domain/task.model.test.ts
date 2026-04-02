import { describe, it, expect, vi } from "vitest";
import { createTask, TaskQueue, type Task } from "../../../src/domain/models/task.model.js";

vi.mock("nanoid", () => ({
  nanoid: (size: number) => "abc12345".slice(0, size),
}));

describe("Task Model", () => {
  describe("createTask", () => {
    it("必須パラメータでタスクを生成する", () => {
      const task = createTask({ description: "バグ修正" });

      expect(task.id).toBeDefined();
      expect(task.description).toBe("バグ修正");
      expect(task.status).toBe("queued");
      expect(task.source).toBe("manual");
      expect(task.createdAt).toBeDefined();
    });

    it("オプショナルパラメータを設定できる", () => {
      const task = createTask({
        description: "機能実装",
        commission: "frontend",
        requirementsId: 42,
        source: "issue",
      });

      expect(task.commission).toBe("frontend");
      expect(task.requirementsId).toBe(42);
      expect(task.source).toBe("issue");
    });

    it("createdAtがISO文字列", () => {
      const task = createTask({ description: "test" });
      expect(() => new Date(task.createdAt)).not.toThrow();
    });
  });

  describe("TaskQueue", () => {
    function makeTask(overrides: Partial<Task> = {}): Task {
      return {
        id: `task-${Math.random().toString(36).slice(2, 6)}`,
        description: "test task",
        status: "queued",
        createdAt: new Date().toISOString(),
        source: "manual",
        ...overrides,
      };
    }

    describe("add / list", () => {
      it("タスクを追加して一覧取得できる", () => {
        const queue = new TaskQueue();
        const task = makeTask({ id: "t1" });

        queue.add(task);
        const listed = queue.list();

        expect(listed).toHaveLength(1);
        expect(listed[0].id).toBe("t1");
      });

      it("初期タスクで構築できる", () => {
        const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
        const queue = new TaskQueue(tasks);

        expect(queue.list()).toHaveLength(2);
      });

      it("listは独立したコピーを返す", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        const list = queue.list();
        expect(list).toHaveLength(1);

        // 外部からの変更がqueueに影響しない
        (list as Task[]).push(makeTask({ id: "t2" }));
        expect(queue.list()).toHaveLength(1);
      });
    });

    describe("remove", () => {
      it("存在するタスクを削除してtrueを返す", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" }), makeTask({ id: "t2" })]);

        const result = queue.remove("t1");

        expect(result).toBe(true);
        expect(queue.list()).toHaveLength(1);
        expect(queue.list()[0].id).toBe("t2");
      });

      it("存在しないIDでfalseを返す", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        expect(queue.remove("nonexistent")).toBe(false);
      });
    });

    describe("getNext", () => {
      it("最初のqueuedタスクを返す", () => {
        const queue = new TaskQueue([
          makeTask({ id: "t1", status: "running" }),
          makeTask({ id: "t2", status: "queued" }),
          makeTask({ id: "t3", status: "queued" }),
        ]);

        const next = queue.getNext();
        expect(next?.id).toBe("t2");
      });

      it("queuedタスクがない場合はundefined", () => {
        const queue = new TaskQueue([makeTask({ id: "t1", status: "completed" })]);
        expect(queue.getNext()).toBeUndefined();
      });

      it("空のキューでundefined", () => {
        const queue = new TaskQueue();
        expect(queue.getNext()).toBeUndefined();
      });
    });

    describe("getNextN", () => {
      it("指定数のqueuedタスクを返す", () => {
        const queue = new TaskQueue([
          makeTask({ id: "t1", status: "queued" }),
          makeTask({ id: "t2", status: "running" }),
          makeTask({ id: "t3", status: "queued" }),
          makeTask({ id: "t4", status: "queued" }),
        ]);

        const next = queue.getNextN(2);
        expect(next).toHaveLength(2);
        expect(next[0].id).toBe("t1");
        expect(next[1].id).toBe("t3");
      });

      it("要求数より少ない場合はある分だけ返す", () => {
        const queue = new TaskQueue([makeTask({ id: "t1", status: "queued" })]);
        const next = queue.getNextN(5);
        expect(next).toHaveLength(1);
      });
    });

    describe("ステータス遷移", () => {
      it("markRunning でタスクをrunningに遷移する", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        queue.markRunning("t1");
        expect(queue.list()[0].status).toBe("running");
      });

      it("markCompleted でタスクをcompletedに遷移する", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        queue.markCompleted("t1");
        expect(queue.list()[0].status).toBe("completed");
      });

      it("markFailed でタスクをfailedに遷移する", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        queue.markFailed("t1");
        expect(queue.list()[0].status).toBe("failed");
      });

      it("存在しないIDでのステータス変更は何もしない", () => {
        const queue = new TaskQueue([makeTask({ id: "t1" })]);
        queue.markRunning("nonexistent");
        expect(queue.list()[0].status).toBe("queued");
      });
    });
  });
});
