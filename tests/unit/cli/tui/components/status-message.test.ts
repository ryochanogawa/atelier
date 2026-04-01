import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { BIOHAZARD_THEME } from "../../../../../src/adapters/theme/biohazard.adapter.js";

// ─── Mock Ink ─────────────────────────────────────────────────
vi.mock("ink", () => ({
  Text: ({ children, color }: { children: React.ReactNode; color?: string }) =>
    React.createElement("span", { "data-color": color }, children),
}));

vi.mock("../../../../../src/cli/tui/theme-context.js", () => ({
  useTheme: () => BIOHAZARD_THEME,
}));

describe("StatusMessage components", () => {
  const { colors, symbols } = BIOHAZARD_THEME;

  let SuccessMessage: typeof import("../../../../../src/cli/tui/components/status-message.js").SuccessMessage;
  let ErrorMessage: typeof import("../../../../../src/cli/tui/components/status-message.js").ErrorMessage;
  let WarningMessage: typeof import("../../../../../src/cli/tui/components/status-message.js").WarningMessage;
  let InfoMessage: typeof import("../../../../../src/cli/tui/components/status-message.js").InfoMessage;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/status-message.js"
    );
    SuccessMessage = mod.SuccessMessage;
    ErrorMessage = mod.ErrorMessage;
    WarningMessage = mod.WarningMessage;
    InfoMessage = mod.InfoMessage;
  });

  describe("SuccessMessage", () => {
    it("success シンボルとカラーでメッセージを表示する", () => {
      // Arrange & Act
      const element = SuccessMessage({ message: "完了しました" });

      // Assert — React element の props.color を検証
      expect(element.props.color).toBe(colors.success);
      const children = React.Children.toArray(element.props.children);
      const text = children.join("");
      expect(text).toContain(symbols.success);
      expect(text).toContain("完了しました");
    });
  });

  describe("ErrorMessage", () => {
    it("error シンボルとカラーでメッセージを表示する", () => {
      // Arrange & Act
      const element = ErrorMessage({ message: "失敗しました" });

      // Assert
      expect(element.props.color).toBe(colors.error);
      const children = React.Children.toArray(element.props.children);
      const text = children.join("");
      expect(text).toContain(symbols.error);
      expect(text).toContain("失敗しました");
    });
  });

  describe("WarningMessage", () => {
    it("warning シンボルとカラーでメッセージを表示する", () => {
      // Arrange & Act
      const element = WarningMessage({ message: "注意" });

      // Assert
      expect(element.props.color).toBe(colors.warning);
      const children = React.Children.toArray(element.props.children);
      const text = children.join("");
      expect(text).toContain(symbols.warning);
      expect(text).toContain("注意");
    });
  });

  describe("InfoMessage", () => {
    it("info シンボルとカラーでメッセージを表示する", () => {
      // Arrange & Act
      const element = InfoMessage({ message: "情報" });

      // Assert
      expect(element.props.color).toBe(colors.info);
      const children = React.Children.toArray(element.props.children);
      const text = children.join("");
      expect(text).toContain(symbols.info);
      expect(text).toContain("情報");
    });
  });
});
