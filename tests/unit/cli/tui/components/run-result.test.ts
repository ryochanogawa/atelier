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

vi.mock("../../../../../src/cli/tui/theme-context.js", () => ({
  useTheme: () => BIOHAZARD_THEME,
}));

describe("RunResult component", () => {
  const { borders, colors, symbols } = BIOHAZARD_THEME;

  let RunResult: typeof import("../../../../../src/cli/tui/components/run-result.js").RunResult;

  const baseProps = {
    runId: "run_001",
    commissionName: "test-commission",
    status: "completed",
    strokesExecuted: 3,
    strokesTotal: 5,
    duration: "12s",
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:00:12Z",
  } as const;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/run-result.js"
    );
    RunResult = mod.RunResult;
  });

  it("基本的な結果パネルを構築する", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps });

    // Assert
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    expect(children.length).toBeGreaterThan(5);

    // top border を含む
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const hasTopBorder = texts.some(
      (t) => t.includes(borders.topLeft) && t.includes(borders.topRight),
    );
    expect(hasTopBorder).toBe(true);

    // Run ID を含む
    const hasRunId = texts.some((t) => t.includes("run_001"));
    expect(hasRunId).toBe(true);
  });

  it("completed ステータスで success カラー・シンボルを使う", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps, status: "completed" });

    // Assert
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const statusLine = texts.find((t) => t.includes("Status"));
    expect(statusLine).toContain(symbols.success);
  });

  it("failed ステータスで error カラー・シンボルを使う", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps, status: "failed" });

    // Assert
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const statusLine = texts.find((t) => t.includes("Status"));
    expect(statusLine).toContain(symbols.error);
  });

  it("その他のステータスで warning カラー・シンボルを使う", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps, status: "running" });

    // Assert
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const statusLine = texts.find((t) => t.includes("Status"));
    expect(statusLine).toContain(symbols.warning);
  });

  it("エラーなしの場合エラーセクションが表示されない", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps });

    // Assert — errors セクションがない
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const hasErrorsTitle = texts.some((t) => t.includes("Errors"));
    expect(hasErrorsTitle).toBe(false);
  });

  it("エラーありの場合エラーセクションが表示される", () => {
    // Arrange
    const errors = [
      { strokeName: "stroke-1", message: "timeout" },
      { strokeName: "stroke-2", message: "failed" },
    ];

    // Act
    const element = RunResult({ ...baseProps, status: "failed", errors });

    // Assert — Fragment が追加されるので children が増える
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    // エラーの Fragment 内に stroke 名が含まれる
    const allTexts = JSON.stringify(children);
    expect(allTexts).toContain("stroke-1");
    expect(allTexts).toContain("timeout");
    expect(allTexts).toContain("stroke-2");
  });

  it("innerWidth が 56 固定である", () => {
    // Arrange & Act
    const element = RunResult({ ...baseProps });

    // Assert — top border の horizontal repeat 回数 = 56
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const texts = children.map((c) => String(c.props?.children ?? ""));
    const topBorder = texts.find(
      (t) => t.includes(borders.topLeft) && t.includes(borders.topRight),
    );
    const expected =
      borders.topLeft + borders.horizontal.repeat(56) + borders.topRight;
    expect(topBorder).toBe(expected);
  });
});
