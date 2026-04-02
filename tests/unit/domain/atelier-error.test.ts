import { describe, it, expect } from "vitest";
import {
  AtelierError,
  CommissionError,
  StrokeError,
  MediumError,
  ConfigError,
  TransitionError,
} from "../../../src/domain/errors/atelier-error.js";

describe("Atelier Domain Errors", () => {
  describe("AtelierError", () => {
    it("code と message を設定する", () => {
      const err = new AtelierError("TEST_CODE", "テストメッセージ");

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("AtelierError");
      expect(err.code).toBe("TEST_CODE");
      expect(err.message).toBe("テストメッセージ");
    });

    it("cause オプションを渡せる", () => {
      const cause = new Error("original");
      const err = new AtelierError("CODE", "msg", { cause });
      expect(err.cause).toBe(cause);
    });
  });

  describe("CommissionError", () => {
    it("commission名をメッセージに含める", () => {
      const err = new CommissionError("my-commission", "開始できません");

      expect(err).toBeInstanceOf(AtelierError);
      expect(err.name).toBe("CommissionError");
      expect(err.code).toBe("COMMISSION_ERROR");
      expect(err.commissionName).toBe("my-commission");
      expect(err.message).toContain("[Commission: my-commission]");
      expect(err.message).toContain("開始できません");
    });
  });

  describe("StrokeError", () => {
    it("stroke名をメッセージに含める", () => {
      const err = new StrokeError("review-step", "遷移が無効です");

      expect(err).toBeInstanceOf(AtelierError);
      expect(err.name).toBe("StrokeError");
      expect(err.code).toBe("STROKE_ERROR");
      expect(err.strokeName).toBe("review-step");
      expect(err.message).toContain("[Stroke: review-step]");
    });
  });

  describe("MediumError", () => {
    it("medium名付きでメッセージを構築する", () => {
      const err = new MediumError("タイムアウト", "claude");

      expect(err).toBeInstanceOf(AtelierError);
      expect(err.name).toBe("MediumError");
      expect(err.code).toBe("MEDIUM_ERROR");
      expect(err.mediumName).toBe("claude");
      expect(err.message).toContain("[Medium: claude]");
    });

    it("medium名なしでメッセージを構築する", () => {
      const err = new MediumError("接続エラー");

      expect(err.mediumName).toBeUndefined();
      expect(err.message).toBe("接続エラー");
    });
  });

  describe("ConfigError", () => {
    it("設定エラーを生成する", () => {
      const err = new ConfigError("YAMLパースエラー");

      expect(err).toBeInstanceOf(AtelierError);
      expect(err.name).toBe("ConfigError");
      expect(err.code).toBe("CONFIG_ERROR");
      expect(err.message).toBe("YAMLパースエラー");
    });
  });

  describe("TransitionError", () => {
    it("遷移元と遷移先をメッセージに含める", () => {
      const err = new TransitionError("step1", "step2", "条件が一致しません");

      expect(err).toBeInstanceOf(AtelierError);
      expect(err.name).toBe("TransitionError");
      expect(err.code).toBe("TRANSITION_ERROR");
      expect(err.fromStroke).toBe("step1");
      expect(err.toStroke).toBe("step2");
      expect(err.message).toContain("[Transition: step1 -> step2]");
      expect(err.message).toContain("条件が一致しません");
    });
  });
});
