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

describe("ProgressBar component", () => {
  const { colors } = BIOHAZARD_THEME;

  let ProgressBar: typeof import("../../../../../src/cli/tui/components/progress-bar.js").ProgressBar;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/progress-bar.js"
    );
    ProgressBar = mod.ProgressBar;
  });

  it("進捗率に応じたバーを表示する", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 5, total: 10, width: 10 });

    // Assert — 50% = filled 5, empty 5
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("█".repeat(5));
    expect(text).toContain("░".repeat(5));
    expect(text).toContain("5/10");
  });

  it("total が 0 のときゼロ除算しない（ratio = 0）", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 0, total: 0, width: 10 });

    // Assert — all empty
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("░".repeat(10));
    expect(text).toContain("0/0");
  });

  it("100% で全ブロックが埋まる", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 10, total: 10, width: 10 });

    // Assert
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("█".repeat(10));
    expect(text).not.toContain("░");
  });

  it("label が表示される", () => {
    // Arrange & Act
    const element = ProgressBar({
      current: 3,
      total: 5,
      label: "strokes",
      width: 10,
    });

    // Assert
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("strokes");
  });

  it("label 省略時にサフィックスなし", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 1, total: 2, width: 10 });

    // Assert
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("1/2");
    // "strokes" 等のラベルが含まれない
    expect(text).not.toContain("strokes");
  });

  it("accent カラーが適用される", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 1, total: 2, width: 10 });

    // Assert — React element の props.color を検証
    expect(element.props.color).toBe(colors.accent);
  });

  it("デフォルト width は 20", () => {
    // Arrange & Act
    const element = ProgressBar({ current: 10, total: 10 });

    // Assert — filled = 20 blocks
    const children = React.Children.toArray(element.props.children);
    const text = children.join("");
    expect(text).toContain("█".repeat(20));
  });
});
