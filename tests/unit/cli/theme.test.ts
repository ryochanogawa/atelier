import { describe, it, expect } from "vitest";
import { COLORS, SYMBOLS, BORDERS, TABLE_STYLE } from "../../../src/cli/theme.js";

describe("theme.ts", () => {
  describe("COLORS", () => {
    it("全カラーキーがエクスポートされている", () => {
      const expectedKeys = [
        "primary", "secondary", "accent", "muted", "text",
        "success", "error", "warning", "info",
      ];
      for (const key of expectedKeys) {
        expect(COLORS).toHaveProperty(key);
      }
    });

    it("各カラーは関数として呼び出し可能", () => {
      for (const [key, colorFn] of Object.entries(COLORS)) {
        expect(typeof colorFn).toBe("function");
        const result = colorFn("test");
        expect(typeof result).toBe("string");
      }
    });
  });

  describe("SYMBOLS", () => {
    it("全シンボルキーがエクスポートされている", () => {
      const expectedKeys = [
        "biohazard", "success", "error", "warning", "info",
        "bullet", "arrow", "line",
      ];
      for (const key of expectedKeys) {
        expect(SYMBOLS).toHaveProperty(key);
        expect(typeof SYMBOLS[key as keyof typeof SYMBOLS]).toBe("string");
      }
    });

    it("biohazard シンボルは ☣", () => {
      expect(SYMBOLS.biohazard).toBe("\u2623");
    });

    it("success シンボルは ☣ (テーマ統一)", () => {
      expect(SYMBOLS.success).toBe("\u2623");
    });
  });

  describe("BORDERS", () => {
    it("全ボーダーキーがエクスポートされている", () => {
      const expectedKeys = [
        "topLeft", "topRight", "bottomLeft", "bottomRight",
        "horizontal", "vertical", "titleLeft", "titleRight",
      ];
      for (const key of expectedKeys) {
        expect(BORDERS).toHaveProperty(key);
        expect(typeof BORDERS[key as keyof typeof BORDERS]).toBe("string");
      }
    });

    it("box-drawing 文字を使用している", () => {
      expect(BORDERS.topLeft).toBe("\u2554");
      expect(BORDERS.topRight).toBe("\u2557");
      expect(BORDERS.bottomLeft).toBe("\u255A");
      expect(BORDERS.bottomRight).toBe("\u255D");
      expect(BORDERS.horizontal).toBe("\u2550");
      expect(BORDERS.vertical).toBe("\u2551");
    });
  });

  describe("TABLE_STYLE", () => {
    it("cli-table3 互換のキーが全て含まれている", () => {
      const expectedKeys = [
        "top", "top-mid", "top-left", "top-right",
        "bottom", "bottom-mid", "bottom-left", "bottom-right",
        "left", "left-mid", "mid", "mid-mid",
        "right", "right-mid", "middle",
      ];
      for (const key of expectedKeys) {
        expect(TABLE_STYLE).toHaveProperty(key);
        expect(typeof TABLE_STYLE[key]).toBe("string");
      }
    });
  });
});
