import { describe, it, expect } from "vitest";
import { createTransition } from "../../../src/domain/value-objects/transition.vo.js";

describe("Transition Value Object", () => {
  describe("createTransition", () => {
    it("有効なパラメータでTransitionを生成する", () => {
      const transition = createTransition({
        condition: "always",
        next: "review",
        maxRetries: 5,
        onMaxRetries: "skip",
        appendix: "追加指示",
      });

      expect(transition.condition).toBe("always");
      expect(transition.next).toBe("review");
      expect(transition.maxRetries).toBe(5);
      expect(transition.onMaxRetries).toBe("skip");
      expect(transition.appendix).toBe("追加指示");
    });

    it("maxRetriesのデフォルト値は3", () => {
      const transition = createTransition({ condition: "always", next: "next" });
      expect(transition.maxRetries).toBe(3);
    });

    it("onMaxRetriesのデフォルト値はfail", () => {
      const transition = createTransition({ condition: "always", next: "next" });
      expect(transition.onMaxRetries).toBe("fail");
    });

    it("appendixが未指定の場合はundefined", () => {
      const transition = createTransition({ condition: "always", next: "next" });
      expect(transition.appendix).toBeUndefined();
    });

    it("生成されたTransitionはfreezeされている", () => {
      const transition = createTransition({ condition: "always", next: "next" });
      expect(Object.isFrozen(transition)).toBe(true);
    });

    it("空のnextでエラーをスローする", () => {
      expect(() => createTransition({ condition: "always", next: "" })).toThrow(
        "Transition target (next) must not be empty",
      );
    });

    it("空白のみのnextでエラーをスローする", () => {
      expect(() => createTransition({ condition: "always", next: "   " })).toThrow(
        "Transition target (next) must not be empty",
      );
    });

    it("onMaxRetriesの各値を設定できる", () => {
      expect(createTransition({ condition: "c", next: "n", onMaxRetries: "fail" }).onMaxRetries).toBe("fail");
      expect(createTransition({ condition: "c", next: "n", onMaxRetries: "skip" }).onMaxRetries).toBe("skip");
      expect(createTransition({ condition: "c", next: "n", onMaxRetries: "continue" }).onMaxRetries).toBe("continue");
    });
  });
});
