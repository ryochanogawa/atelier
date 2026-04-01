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

describe("SectionDivider component", () => {
  const { borders, colors } = BIOHAZARD_THEME;

  let SectionDivider: typeof import("../../../../../src/cli/tui/components/section-divider.js").SectionDivider;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/section-divider.js"
    );
    SectionDivider = mod.SectionDivider;
  });

  it("タイトルを含む区切り線を構築する", () => {
    // Arrange & Act
    const element = SectionDivider({ title: "Section", width: 40 });

    // Assert
    const line = element.props.children as string;
    expect(line).toContain(borders.titleLeft);
    expect(line).toContain("Section");
    expect(line).toContain(borders.titleRight);
    expect(line).toContain(borders.horizontal);
  });

  it("accent カラーで描画する", () => {
    // Arrange & Act
    const element = SectionDivider({ title: "Test", width: 40 });

    // Assert
    expect(element.props.color).toBe(colors.accent);
  });

  it("totalWidth が 60 を超えない", () => {
    // Arrange & Act
    const element = SectionDivider({ title: "X", width: 200 });

    // Assert — totalWidth = min(200, 60) = 60
    const line = element.props.children as string;
    const inner = `${borders.titleLeft} X ${borders.titleRight}`;
    const sideLen = Math.max(0, Math.floor((60 - inner.length) / 2));
    const expected =
      borders.horizontal.repeat(sideLen) +
      inner +
      borders.horizontal.repeat(sideLen);
    expect(line).toBe(expected);
  });

  it("タイトルが区切り線の中央に配置される", () => {
    // Arrange & Act
    const element = SectionDivider({ title: "AB", width: 40 });

    // Assert
    const line = element.props.children as string;
    const inner = `${borders.titleLeft} AB ${borders.titleRight}`;
    const idx = line.indexOf(inner);
    expect(idx).toBeGreaterThan(0);
    // 左右のボーダー文字数がほぼ同じ
    const leftSide = line.substring(0, idx);
    const rightSide = line.substring(idx + inner.length);
    expect(Math.abs(leftSide.length - rightSide.length)).toBeLessThanOrEqual(1);
  });
});
