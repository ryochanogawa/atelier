import { describe, it, expect } from "vitest";
import {
  CommissionStatus,
  isValidCommissionTransition,
} from "../../../src/domain/value-objects/commission-status.vo.js";

describe("CommissionStatus", () => {
  describe("定数値", () => {
    it("すべてのステータスが定義されている", () => {
      expect(CommissionStatus.Draft).toBe("draft");
      expect(CommissionStatus.Running).toBe("running");
      expect(CommissionStatus.Completed).toBe("completed");
      expect(CommissionStatus.Failed).toBe("failed");
      expect(CommissionStatus.Aborted).toBe("aborted");
    });
  });

  describe("isValidCommissionTransition", () => {
    describe("Draft からの遷移", () => {
      it("Running への遷移は有効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Draft, CommissionStatus.Running)).toBe(true);
      });

      it("Completed への直接遷移は無効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Draft, CommissionStatus.Completed)).toBe(false);
      });

      it("Failed への直接遷移は無効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Draft, CommissionStatus.Failed)).toBe(false);
      });

      it("Aborted への直接遷移は無効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Draft, CommissionStatus.Aborted)).toBe(false);
      });
    });

    describe("Running からの遷移", () => {
      it("Completed への遷移は有効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Running, CommissionStatus.Completed)).toBe(true);
      });

      it("Failed への遷移は有効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Running, CommissionStatus.Failed)).toBe(true);
      });

      it("Aborted への遷移は有効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Running, CommissionStatus.Aborted)).toBe(true);
      });

      it("Draft への遷移は無効", () => {
        expect(isValidCommissionTransition(CommissionStatus.Running, CommissionStatus.Draft)).toBe(false);
      });
    });

    describe("終端状態からの遷移", () => {
      it("Completed からはどこにも遷移できない", () => {
        expect(isValidCommissionTransition(CommissionStatus.Completed, CommissionStatus.Running)).toBe(false);
        expect(isValidCommissionTransition(CommissionStatus.Completed, CommissionStatus.Draft)).toBe(false);
      });

      it("Failed からはどこにも遷移できない", () => {
        expect(isValidCommissionTransition(CommissionStatus.Failed, CommissionStatus.Running)).toBe(false);
        expect(isValidCommissionTransition(CommissionStatus.Failed, CommissionStatus.Draft)).toBe(false);
      });

      it("Aborted からはどこにも遷移できない", () => {
        expect(isValidCommissionTransition(CommissionStatus.Aborted, CommissionStatus.Running)).toBe(false);
        expect(isValidCommissionTransition(CommissionStatus.Aborted, CommissionStatus.Draft)).toBe(false);
      });
    });
  });
});
