import { describe, it, expect } from "vitest";
import { Commission, type CommissionParams } from "../../../src/domain/aggregates/commission.aggregate.js";
import { CommissionStatus } from "../../../src/domain/value-objects/commission-status.vo.js";
import { StrokeStatus } from "../../../src/domain/value-objects/stroke-status.vo.js";
import { CommissionError } from "../../../src/domain/errors/atelier-error.js";
import type { StrokeDefinition } from "../../../src/domain/models/stroke.model.js";

function createStrokeDef(name: string): StrokeDefinition {
  return {
    name,
    palette: "default",
    medium: "claude",
    allowEdit: false,
    instruction: "テスト",
    inputs: [],
    outputs: [],
    transitions: [],
    contract: "",
  };
}

function createCommissionParams(overrides: Partial<CommissionParams> = {}): CommissionParams {
  return {
    name: "test-commission",
    description: "テスト用コミッション",
    initialStroke: "step1",
    maxStrokes: 10,
    strokeDefinitions: [createStrokeDef("step1"), createStrokeDef("step2")],
    runId: "run-1",
    ...overrides,
  };
}

describe("Commission Aggregate", () => {
  describe("コンストラクタ", () => {
    it("有効なパラメータでCommissionを生成する", () => {
      const commission = new Commission(createCommissionParams());

      expect(commission.name).toBe("test-commission");
      expect(commission.description).toBe("テスト用コミッション");
      expect(commission.initialStroke).toBe("step1");
      expect(commission.maxStrokes).toBe(10);
      expect(commission.strokes).toHaveLength(2);
      expect(commission.status).toBe(CommissionStatus.Draft);
      expect(commission.currentStrokeName).toBeNull();
      expect(commission.executedStrokeCount).toBe(0);
      expect(commission.runId).toBe("run-1");
    });

    it("空の名前でCommissionErrorをスローする", () => {
      expect(() => new Commission(createCommissionParams({ name: "" }))).toThrow(CommissionError);
      expect(() => new Commission(createCommissionParams({ name: "  " }))).toThrow(CommissionError);
    });

    it("strokeDefinitionsが空でエラーをスローする", () => {
      expect(() => new Commission(createCommissionParams({ strokeDefinitions: [] }))).toThrow(
        /must have at least one stroke/,
      );
    });

    it("initialStrokeが存在しない場合エラーをスローする", () => {
      expect(() => new Commission(createCommissionParams({ initialStroke: "nonexistent" }))).toThrow(
        /Initial stroke "nonexistent" not found/,
      );
    });

    it("strokesがfreezeされている", () => {
      const commission = new Commission(createCommissionParams());
      expect(Object.isFrozen(commission.strokes)).toBe(true);
    });
  });

  describe("start", () => {
    it("Draft → Running に遷移し、initialStrokeを設定する", () => {
      const commission = new Commission(createCommissionParams());

      commission.start();

      expect(commission.status).toBe(CommissionStatus.Running);
      expect(commission.currentStrokeName).toBe("step1");
    });

    it("startでドメインイベントが発行される", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      const events = commission.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("commission.started");
    });

    it("Running状態からstartするとエラー", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      expect(() => commission.start()).toThrow(CommissionError);
    });
  });

  describe("getStroke", () => {
    it("名前でStrokeを取得する", () => {
      const commission = new Commission(createCommissionParams());
      const stroke = commission.getStroke("step1");
      expect(stroke.name).toBe("step1");
    });

    it("存在しないStroke名でエラーをスローする", () => {
      const commission = new Commission(createCommissionParams());
      expect(() => commission.getStroke("nonexistent")).toThrow(/Stroke "nonexistent" not found/);
    });
  });

  describe("currentStroke", () => {
    it("start前はnull", () => {
      const commission = new Commission(createCommissionParams());
      expect(commission.currentStroke).toBeNull();
    });

    it("start後はinitialStrokeを返す", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();
      expect(commission.currentStroke?.name).toBe("step1");
    });
  });

  describe("advanceToStroke", () => {
    it("次のStrokeに進む", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      commission.advanceToStroke("step2");

      expect(commission.currentStrokeName).toBe("step2");
      expect(commission.executedStrokeCount).toBe(1);
    });

    it("Running以外の状態でエラーをスローする", () => {
      const commission = new Commission(createCommissionParams());
      expect(() => commission.advanceToStroke("step2")).toThrow(
        /Cannot advance stroke/,
      );
    });

    it("存在しないStrokeへの遷移でエラーをスローする", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();
      expect(() => commission.advanceToStroke("nonexistent")).toThrow(
        /Stroke "nonexistent" not found/,
      );
    });

    it("maxStrokesを超えるとエラーをスローする", () => {
      const commission = new Commission(createCommissionParams({ maxStrokes: 1 }));
      commission.start();

      commission.advanceToStroke("step2");
      expect(() => commission.advanceToStroke("step1")).toThrow(/Max strokes limit/);
    });
  });

  describe("complete", () => {
    it("Running → Completed に遷移する", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      commission.complete();

      expect(commission.status).toBe(CommissionStatus.Completed);
      expect(commission.currentStrokeName).toBeNull();
    });

    it("completeでドメインイベントが発行される", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();
      commission.clearDomainEvents();

      commission.complete();

      const events = commission.domainEvents;
      expect(events.some((e) => e.eventType === "commission.completed")).toBe(true);
    });

    it("Running以外でcompleteするとエラー", () => {
      const commission = new Commission(createCommissionParams());
      expect(() => commission.complete()).toThrow(/Cannot complete/);
    });
  });

  describe("fail", () => {
    it("Running → Failed に遷移する", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      commission.fail("テストエラー");

      expect(commission.status).toBe(CommissionStatus.Failed);
      expect(commission.currentStrokeName).toBeNull();
    });

    it("failでドメインイベントにreasonが含まれる", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();
      commission.clearDomainEvents();

      commission.fail("原因");

      const failEvent = commission.domainEvents.find(
        (e) => e.eventType === "commission.failed",
      );
      expect(failEvent?.payload).toHaveProperty("reason", "原因");
    });

    it("Running以外でfailするとエラー", () => {
      const commission = new Commission(createCommissionParams());
      expect(() => commission.fail("reason")).toThrow(/Cannot fail/);
    });
  });

  describe("abort", () => {
    it("Running → Aborted に遷移し、PendingなStrokeをSkipする", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      commission.abort("ユーザー中断");

      expect(commission.status).toBe(CommissionStatus.Aborted);
      expect(commission.currentStrokeName).toBeNull();

      // Pending だったStrokeがSkippedになっている
      const pendingStrokes = commission.strokes.filter(
        (s) => s.status === StrokeStatus.Pending,
      );
      expect(pendingStrokes).toHaveLength(0);
    });

    it("Running以外でabortするとエラー", () => {
      const commission = new Commission(createCommissionParams());
      expect(() => commission.abort("reason")).toThrow(/Cannot abort/);
    });
  });

  describe("domainEvents", () => {
    it("clearDomainEventsでイベントをクリアする", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();
      expect(commission.domainEvents.length).toBeGreaterThan(0);

      commission.clearDomainEvents();

      expect(commission.domainEvents).toHaveLength(0);
    });

    it("domainEventsはコピーを返す", () => {
      const commission = new Commission(createCommissionParams());
      commission.start();

      const events = commission.domainEvents;
      expect(events).toHaveLength(1);

      // 外部からの変更が内部に影響しない
      (events as unknown[]).push({ fake: true });
      expect(commission.domainEvents).toHaveLength(1);
    });
  });
});
