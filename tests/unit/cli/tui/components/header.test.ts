import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { BIOHAZARD_THEME } from "../../../../../src/adapters/theme/biohazard.adapter.js";

// ─── Mock Ink ─────────────────────────────────────────────────
vi.mock("ink", () => ({
  Text: ({ children, color }: { children: React.ReactNode; color?: string }) =>
    React.createElement("span", { "data-color": color }, children),
  Box: ({
    children,
  }: {
    children: React.ReactNode;
    flexDirection?: string;
  }) => React.createElement("div", null, children),
}));

// ─── Mock useTheme ──────────────────────────────────────────
vi.mock("../../../../../src/cli/tui/theme-context.js", () => ({
  useTheme: () => BIOHAZARD_THEME,
}));

describe("Header component", () => {
  const { borders, colors } = BIOHAZARD_THEME;

  let Header: typeof import("../../../../../src/cli/tui/components/header.js").Header;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/header.js"
    );
    Header = mod.Header;
  });

  it("ボーダー付きヘッダーを構築する", () => {
    // Arrange
    const title = "TEST";
    const width = 40;

    // Act
    const element = Header({ title, width });

    // Assert — Box(column) の children に Text が3つ
    const children = element.props.children as React.ReactElement[];
    expect(children).toHaveLength(3);

    // top border
    const topText = children[0].props.children as string;
    expect(topText).toContain(borders.topLeft);
    expect(topText).toContain(borders.topRight);
    expect(topText).toContain(borders.horizontal);

    // title line
    const titleText = children[1].props.children as string;
    expect(titleText).toContain(borders.vertical);
    expect(titleText).toContain("TEST");

    // bottom border
    const bottomText = children[2].props.children as string;
    expect(bottomText).toContain(borders.bottomLeft);
    expect(bottomText).toContain(borders.bottomRight);
  });

  it("タイトルが中央寄せされる", () => {
    // Arrange
    const title = "AB";
    const width = 20;

    // Act
    const element = Header({ title, width });

    // Assert
    const titleLine = (element.props.children as React.ReactElement[])[1];
    const content = titleLine.props.children as string;
    // vertical + spaces + "AB" + spaces + vertical
    expect(content.startsWith(borders.vertical)).toBe(true);
    expect(content.endsWith(borders.vertical)).toBe(true);
    expect(content).toContain("AB");
  });

  it("すべての Text に primary カラーが設定される", () => {
    // Arrange & Act
    const element = Header({ title: "X", width: 30 });

    // Assert — React element の props.color を検証
    const children = element.props.children as React.ReactElement[];
    for (const child of children) {
      expect(child.props.color).toBe(colors.primary);
    }
  });

  it("innerWidth が 60 を超えない", () => {
    // Arrange — 非常に大きな width を指定
    const title = "A";
    const width = 200;

    // Act
    const element = Header({ title, width });

    // Assert — horizontal の repeat 回数 = innerWidth = min(200, 60) = 60
    const topText = (element.props.children as React.ReactElement[])[0].props
      .children as string;
    const expectedTop =
      borders.topLeft + borders.horizontal.repeat(60) + borders.topRight;
    expect(topText).toBe(expectedTop);
  });

  it("width 未指定時に process.stdout.columns を使う", () => {
    // Arrange
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", {
      value: 50,
      configurable: true,
    });

    // Act — width 省略
    const element = Header({ title: "T" });

    // Assert — innerWidth = min(50 - 2, 60) = 48
    const topText = (element.props.children as React.ReactElement[])[0].props
      .children as string;
    const expectedTop =
      borders.topLeft + borders.horizontal.repeat(48) + borders.topRight;
    expect(topText).toBe(expectedTop);

    // Cleanup
    Object.defineProperty(process.stdout, "columns", {
      value: originalColumns,
      configurable: true,
    });
  });
});
