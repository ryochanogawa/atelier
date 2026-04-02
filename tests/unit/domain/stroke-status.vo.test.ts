import { describe, it, expect } from "vitest";
import {
  StrokeStatus,
  isValidStrokeTransition,
} from "../../../src/domain/value-objects/stroke-status.vo.js";

describe("StrokeStatus", () => {
  describe("定数値", () => {
    it("すべてのステータスが定義されている", () => {
      expect(StrokeStatus.Pending).toBe("pending");
      expect(StrokeStatus.Composing).toBe("composing");
      expect(StrokeStatus.Executing).toBe("executing");
      expect(StrokeStatus.Critiquing).toBe("critiquing");
      expect(StrokeStatus.Retouching).toBe("retouching");
      expect(StrokeStatus.Completed).toBe("completed");
      expect(StrokeStatus.Failed).toBe("failed");
      expect(StrokeStatus.Skipped).toBe("skipped");
    });
  });

  describe("isValidStrokeTransition", () => {
    describe("Pending からの遷移", () => {
      it("Composing への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Pending, StrokeStatus.Composing)).toBe(true);
      });

      it("Skipped への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Pending, StrokeStatus.Skipped)).toBe(true);
      });

      it("Executing への直接遷移は無効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Pending, StrokeStatus.Executing)).toBe(false);
      });

      it("Completed への直接遷移は無効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Pending, StrokeStatus.Completed)).toBe(false);
      });
    });

    describe("Composing からの遷移", () => {
      it("Executing への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Composing, StrokeStatus.Executing)).toBe(true);
      });

      it("Failed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Composing, StrokeStatus.Failed)).toBe(true);
      });

      it("Completed への直接遷移は無効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Composing, StrokeStatus.Completed)).toBe(false);
      });
    });

    describe("Executing からの遷移", () => {
      it("Critiquing への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Executing, StrokeStatus.Critiquing)).toBe(true);
      });

      it("Completed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Executing, StrokeStatus.Completed)).toBe(true);
      });

      it("Failed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Executing, StrokeStatus.Failed)).toBe(true);
      });

      it("Pending への遷移は無効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Executing, StrokeStatus.Pending)).toBe(false);
      });
    });

    describe("Critiquing からの遷移", () => {
      it("Completed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Critiquing, StrokeStatus.Completed)).toBe(true);
      });

      it("Retouching への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Critiquing, StrokeStatus.Retouching)).toBe(true);
      });

      it("Failed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Critiquing, StrokeStatus.Failed)).toBe(true);
      });
    });

    describe("Retouching からの遷移", () => {
      it("Executing への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Retouching, StrokeStatus.Executing)).toBe(true);
      });

      it("Failed への遷移は有効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Retouching, StrokeStatus.Failed)).toBe(true);
      });

      it("Completed への直接遷移は無効", () => {
        expect(isValidStrokeTransition(StrokeStatus.Retouching, StrokeStatus.Completed)).toBe(false);
      });
    });

    describe("終端状態からの遷移", () => {
      it("Completed からはどこにも遷移できない", () => {
        expect(isValidStrokeTransition(StrokeStatus.Completed, StrokeStatus.Pending)).toBe(false);
        expect(isValidStrokeTransition(StrokeStatus.Completed, StrokeStatus.Failed)).toBe(false);
      });

      it("Failed からはどこにも遷移できない", () => {
        expect(isValidStrokeTransition(StrokeStatus.Failed, StrokeStatus.Pending)).toBe(false);
        expect(isValidStrokeTransition(StrokeStatus.Failed, StrokeStatus.Completed)).toBe(false);
      });

      it("Skipped からはどこにも遷移できない", () => {
        expect(isValidStrokeTransition(StrokeStatus.Skipped, StrokeStatus.Pending)).toBe(false);
        expect(isValidStrokeTransition(StrokeStatus.Skipped, StrokeStatus.Executing)).toBe(false);
      });
    });
  });
});
