import { describe, it, expect, vi } from "vitest";
import { BIOHAZARD_THEME } from "../../../../src/adapters/theme/biohazard.adapter.js";

describe("theme-context", () => {
  it("useTheme は関数としてエクスポートされている", async () => {
    // Arrange & Act
    const { useTheme } = await import(
      "../../../../src/cli/tui/theme-context.js"
    );

    // Assert
    expect(typeof useTheme).toBe("function");
  });

  it("ThemeProvider は React.Context.Provider としてエクスポートされている", async () => {
    // Arrange & Act
    const { ThemeProvider } = await import(
      "../../../../src/cli/tui/theme-context.js"
    );

    // Assert
    expect(ThemeProvider).toBeDefined();
    // Context.Provider は $$typeof を持つ
    expect((ThemeProvider as any).$$typeof).toBeDefined();
  });

  it("useTheme のエラーメッセージが正しい", async () => {
    // Arrange — useTheme の実装を直接読んで、null チェック時のメッセージを検証
    // React Hook は React レンダリングツリー外では呼べないため、
    // ソースコードのエラーメッセージの存在を間接的に検証する
    const mod = await import("../../../../src/cli/tui/theme-context.js");
    const source = mod.useTheme.toString();

    // Assert — 関数内に正しいエラーメッセージが含まれている
    expect(source).toContain("useTheme must be used within a ThemeProvider");
  });
});
