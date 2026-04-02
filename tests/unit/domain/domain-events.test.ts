import { describe, it, expect } from "vitest";
import { createEventId } from "../../../src/domain/events/domain-event.js";
import {
  commissionStarted,
  commissionCompleted,
  commissionFailed,
  commissionAborted,
} from "../../../src/domain/events/commission-events.js";
import {
  strokeStarted,
  strokeCompleted,
  strokeFailed,
  strokeRetried,
} from "../../../src/domain/events/stroke-events.js";

describe("Domain Events", () => {
  describe("createEventId", () => {
    it("evt_ プレフィックスのIDを生成する", () => {
      const id = createEventId();
      expect(id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it("毎回異なるIDを生成する", () => {
      const id1 = createEventId();
      const id2 = createEventId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("Commission Events", () => {
    describe("commissionStarted", () => {
      it("正しいイベントを生成する", () => {
        const event = commissionStarted("my-comm", "run-1");

        expect(event.eventType).toBe("commission.started");
        expect(event.eventId).toMatch(/^evt_/);
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.payload.commissionName).toBe("my-comm");
        expect(event.payload.runId).toBe("run-1");
      });

      it("freezeされたイベントを返す", () => {
        const event = commissionStarted("c", "r");
        expect(Object.isFrozen(event)).toBe(true);
        expect(Object.isFrozen(event.payload)).toBe(true);
      });
    });

    describe("commissionCompleted", () => {
      it("正しいイベントを生成する", () => {
        const event = commissionCompleted("my-comm", "run-1");
        expect(event.eventType).toBe("commission.completed");
        expect(event.payload.commissionName).toBe("my-comm");
      });
    });

    describe("commissionFailed", () => {
      it("reasonを含むイベントを生成する", () => {
        const event = commissionFailed("my-comm", "run-1", "タイムアウト");
        expect(event.eventType).toBe("commission.failed");
        expect(event.payload.reason).toBe("タイムアウト");
      });
    });

    describe("commissionAborted", () => {
      it("reasonを含むイベントを生成する", () => {
        const event = commissionAborted("my-comm", "run-1", "ユーザー中断");
        expect(event.eventType).toBe("commission.aborted");
        expect(event.payload.reason).toBe("ユーザー中断");
      });
    });
  });

  describe("Stroke Events", () => {
    describe("strokeStarted", () => {
      it("正しいイベントを生成する", () => {
        const event = strokeStarted("comm", "stroke1", "run-1");

        expect(event.eventType).toBe("stroke.started");
        expect(event.payload.commissionName).toBe("comm");
        expect(event.payload.strokeName).toBe("stroke1");
        expect(event.payload.runId).toBe("run-1");
      });
    });

    describe("strokeCompleted", () => {
      it("正しいイベントを生成する", () => {
        const event = strokeCompleted("comm", "stroke1", "run-1");
        expect(event.eventType).toBe("stroke.completed");
      });
    });

    describe("strokeFailed", () => {
      it("reasonを含むイベントを生成する", () => {
        const event = strokeFailed("comm", "stroke1", "run-1", "実行エラー");
        expect(event.eventType).toBe("stroke.failed");
        expect(event.payload.reason).toBe("実行エラー");
      });
    });

    describe("strokeRetried", () => {
      it("retryCountとreasonを含むイベントを生成する", () => {
        const event = strokeRetried("comm", "stroke1", "run-1", 2, "再試行");
        expect(event.eventType).toBe("stroke.retried");
        expect(event.payload.retryCount).toBe(2);
        expect(event.payload.reason).toBe("再試行");
      });
    });
  });
});
