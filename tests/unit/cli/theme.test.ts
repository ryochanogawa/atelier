import { describe, it, expect } from "vitest";
import { BIOHAZARD_THEME } from "../../../src/adapters/theme/biohazard.adapter.js";
import { ThemePortSchema } from "../../../src/adapters/theme/theme.schema.js";

describe("BIOHAZARD_THEME (ThemePort Adapter)", () => {
  describe("meta", () => {
    it("name が 'biohazard'", () => {
      expect(BIOHAZARD_THEME.meta.name).toBe("biohazard");
    });

    it("displayName が定義されている", () => {
      expect(BIOHAZARD_THEME.meta.displayName).toBe("Biohazard");
    });

    it("version が semver 形式", () => {
      expect(BIOHAZARD_THEME.meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("colors", () => {
    it("全カラーキーが hex 文字列で定義されている", () => {
      const expectedKeys = [
        "primary", "secondary", "accent", "muted", "text",
        "success", "error", "warning", "info",
      ] as const;
      for (const key of expectedKeys) {
        expect(BIOHAZARD_THEME.colors[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("primary は #CC0000", () => {
      expect(BIOHAZARD_THEME.colors.primary).toBe("#CC0000");
    });
  });

  describe("symbols", () => {
    it("全シンボルキーが文字列で定義されている", () => {
      const expectedKeys = [
        "brand", "success", "error", "warning", "info",
        "bullet", "arrow", "line",
      ] as const;
      for (const key of expectedKeys) {
        expect(typeof BIOHAZARD_THEME.symbols[key]).toBe("string");
        expect(BIOHAZARD_THEME.symbols[key].length).toBeGreaterThan(0);
      }
    });

    it("brand シンボルは ☣", () => {
      expect(BIOHAZARD_THEME.symbols.brand).toBe("\u2623");
    });
  });

  describe("borders", () => {
    it("全ボーダーキーが定義されている", () => {
      const expectedKeys = [
        "topLeft", "topRight", "bottomLeft", "bottomRight",
        "horizontal", "vertical", "titleLeft", "titleRight",
      ] as const;
      for (const key of expectedKeys) {
        expect(typeof BIOHAZARD_THEME.borders[key]).toBe("string");
        expect(BIOHAZARD_THEME.borders[key].length).toBeGreaterThan(0);
      }
    });

    it("box-drawing 文字を使用している", () => {
      expect(BIOHAZARD_THEME.borders.topLeft).toBe("\u2554");
      expect(BIOHAZARD_THEME.borders.topRight).toBe("\u2557");
      expect(BIOHAZARD_THEME.borders.bottomLeft).toBe("\u255A");
      expect(BIOHAZARD_THEME.borders.bottomRight).toBe("\u255D");
      expect(BIOHAZARD_THEME.borders.horizontal).toBe("\u2550");
      expect(BIOHAZARD_THEME.borders.vertical).toBe("\u2551");
    });
  });

  describe("tableStyle", () => {
    it("cli-table3 互換のキーが全て含まれている", () => {
      const expectedKeys = [
        "top", "top-mid", "top-left", "top-right",
        "bottom", "bottom-mid", "bottom-left", "bottom-right",
        "left", "left-mid", "mid", "mid-mid",
        "right", "right-mid", "middle",
      ];
      for (const key of expectedKeys) {
        expect(BIOHAZARD_THEME.tableStyle).toHaveProperty(key);
        expect(typeof BIOHAZARD_THEME.tableStyle[key]).toBe("string");
      }
    });
  });

  describe("ThemePortSchema バリデーション", () => {
    it("BIOHAZARD_THEME が Zod スキーマに適合する", () => {
      const result = ThemePortSchema.safeParse(BIOHAZARD_THEME);
      expect(result.success).toBe(true);
    });

    it("不完全なテーマはバリデーション失敗する", () => {
      const incomplete = { meta: { name: "bad" } };
      const result = ThemePortSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });

    it("colors が空文字列だとバリデーション失敗する", () => {
      const bad = {
        ...BIOHAZARD_THEME,
        colors: { ...BIOHAZARD_THEME.colors, primary: "" },
      };
      const result = ThemePortSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });
});
