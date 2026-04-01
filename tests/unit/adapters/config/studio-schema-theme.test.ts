import { describe, it, expect } from "vitest";
import { StudioConfigSchema } from "../../../../src/adapters/config/schemas/studio.schema.js";

describe("StudioConfigSchema — theme フィールド", () => {
  const minimalConfig = {
    name: "test-studio",
    mediums: [{ name: "claude", timeout: 30000, allowEdit: false }],
    strokes: [{ name: "s1", medium: "claude", commission: "review" }],
  };

  it("theme 省略時にバリデーション成功する", () => {
    // Arrange & Act
    const result = StudioConfigSchema.safeParse(minimalConfig);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBeUndefined();
    }
  });

  it("theme に文字列を指定するとバリデーション成功する", () => {
    // Arrange
    const config = { ...minimalConfig, theme: "biohazard" };

    // Act
    const result = StudioConfigSchema.safeParse(config);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe("biohazard");
    }
  });

  it("theme にカスタムテーマ名を指定できる", () => {
    // Arrange
    const config = { ...minimalConfig, theme: "atelier-theme-mgs" };

    // Act
    const result = StudioConfigSchema.safeParse(config);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe("atelier-theme-mgs");
    }
  });

  it("theme に数値を指定するとバリデーション失敗する", () => {
    // Arrange
    const config = { ...minimalConfig, theme: 123 };

    // Act
    const result = StudioConfigSchema.safeParse(config);

    // Assert
    expect(result.success).toBe(false);
  });
});
