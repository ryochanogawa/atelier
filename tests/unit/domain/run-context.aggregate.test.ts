import { describe, it, expect } from "vitest";
import { RunContext, type StrokeExecution } from "../../../src/domain/aggregates/run-context.aggregate.js";
import { CommissionStatus } from "../../../src/domain/value-objects/commission-status.vo.js";
import { Canvas } from "../../../src/domain/models/canvas.model.js";

function createExecution(overrides: Partial<StrokeExecution> = {}): StrokeExecution {
  return {
    strokeName: "step1",
    startedAt: new Date(),
    completedAt: new Date(),
    success: true,
    retryCount: 0,
    ...overrides,
  };
}

describe("RunContext Aggregate", () => {
  describe("コンストラクタ", () => {
    it("必須パラメータでRunContextを生成する", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "my-comm",
        status: CommissionStatus.Draft,
      });

      expect(ctx.runId).toBe("run-1");
      expect(ctx.commissionName).toBe("my-comm");
      expect(ctx.status).toBe(CommissionStatus.Draft);
      expect(ctx.startedAt).toBeInstanceOf(Date);
      expect(ctx.canvas).toBeInstanceOf(Canvas);
      expect(ctx.worktreePath).toBeNull();
      expect(ctx.currentStroke).toBeNull();
      expect(ctx.strokeHistory).toHaveLength(0);
    });

    it("オプショナルパラメータを設定できる", () => {
      const canvas = new Canvas({ key: "value" });
      const ctx = new RunContext({
        runId: "run-2",
        commissionName: "comm",
        canvas,
        worktreePath: "/tmp/wt",
        status: CommissionStatus.Running,
      });

      expect(ctx.canvas.get("key")).toBe("value");
      expect(ctx.worktreePath).toBe("/tmp/wt");
    });
  });

  describe("currentStroke", () => {
    it("設定と取得ができる", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.currentStroke = "step1";
      expect(ctx.currentStroke).toBe("step1");

      ctx.currentStroke = null;
      expect(ctx.currentStroke).toBeNull();
    });
  });

  describe("status", () => {
    it("設定と取得ができる", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Draft,
      });

      ctx.status = CommissionStatus.Running;
      expect(ctx.status).toBe(CommissionStatus.Running);
    });
  });

  describe("recordStrokeExecution / strokeHistory", () => {
    it("実行履歴を記録する", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.recordStrokeExecution(createExecution({ strokeName: "step1" }));
      ctx.recordStrokeExecution(createExecution({ strokeName: "step2" }));

      expect(ctx.strokeHistory).toHaveLength(2);
      expect(ctx.strokeHistory[0].strokeName).toBe("step1");
      expect(ctx.strokeHistory[1].strokeName).toBe("step2");
    });

    it("strokeHistoryはコピーを返す", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.recordStrokeExecution(createExecution());
      const history = ctx.strokeHistory;

      expect(history).toHaveLength(1);
      (history as StrokeExecution[]).push(createExecution({ strokeName: "extra" }));
      expect(ctx.strokeHistory).toHaveLength(1);
    });
  });

  describe("getCurrentExecution", () => {
    it("currentStrokeの最新の実行を返す", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.currentStroke = "step1";
      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", retryCount: 0 }));
      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", retryCount: 1 }));

      const current = ctx.getCurrentExecution();
      expect(current?.retryCount).toBe(1);
    });

    it("currentStrokeがnullの場合はundefined", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      expect(ctx.getCurrentExecution()).toBeUndefined();
    });

    it("currentStrokeの履歴がない場合はundefined", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.currentStroke = "step1";
      ctx.recordStrokeExecution(createExecution({ strokeName: "step2" }));

      expect(ctx.getCurrentExecution()).toBeUndefined();
    });
  });

  describe("getRetryCount", () => {
    it("失敗した実行の回数を返す", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", success: false }));
      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", success: false }));
      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", success: true }));

      expect(ctx.getRetryCount("step1")).toBe(2);
    });

    it("失敗がない場合は0を返す", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", success: true }));

      expect(ctx.getRetryCount("step1")).toBe(0);
    });

    it("他のStrokeの失敗は含めない", () => {
      const ctx = new RunContext({
        runId: "run-1",
        commissionName: "comm",
        status: CommissionStatus.Running,
      });

      ctx.recordStrokeExecution(createExecution({ strokeName: "step1", success: false }));
      ctx.recordStrokeExecution(createExecution({ strokeName: "step2", success: false }));

      expect(ctx.getRetryCount("step1")).toBe(1);
    });
  });
});
