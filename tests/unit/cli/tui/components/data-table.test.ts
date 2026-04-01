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

describe("DataTable component", () => {
  const { borders, colors } = BIOHAZARD_THEME;

  let DataTable: typeof import("../../../../../src/cli/tui/components/data-table.js").DataTable;

  beforeEach(async () => {
    const mod = await import(
      "../../../../../src/cli/tui/components/data-table.js"
    );
    DataTable = mod.DataTable;
  });

  it("ヘッダーとデータ行を含むテーブルを構築する", () => {
    // Arrange
    const headers = ["Name", "Value"];
    const rows = [["foo", "bar"]];

    // Act
    const element = DataTable({ headers, rows });

    // Assert — Box(column) の children: topLine, headerRow, divider, dataRows..., bottomLine
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    // 最低でも topLine + headerRow + divider + 1 dataRow + bottomLine = 5
    expect(children.length).toBeGreaterThanOrEqual(5);

    // top line
    const topLine = children[0].props.children as string;
    expect(topLine).toContain(borders.topLeft);
    expect(topLine).toContain(borders.topRight);

    // bottom line（最後の要素）
    const bottomLine = children[children.length - 1].props.children as string;
    expect(bottomLine).toContain(borders.bottomLeft);
    expect(bottomLine).toContain(borders.bottomRight);
  });

  it("列幅がヘッダーとデータの最大値 + 2 で計算される", () => {
    // Arrange — "Name" (4) vs "foobar" (6) → colWidth = 6 + 2 = 8
    const headers = ["Name"];
    const rows = [["foobar"], ["ab"]];

    // Act
    const element = DataTable({ headers, rows });

    // Assert — horizontal line の長さで検証
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    const topLine = children[0].props.children as string;
    // colWidth = max(4, 6) + 2 = 8, horizontal.repeat(8)
    expect(topLine).toContain(borders.horizontal.repeat(8));
  });

  it("空のセルを正しく処理する (row[i] が undefined)", () => {
    // Arrange — headers が 2列だが row は 1列のみ
    const headers = ["A", "B"];
    const rows = [["only-a"]];

    // Act & Assert — エラーなく構築される
    expect(() => DataTable({ headers, rows })).not.toThrow();
  });

  it("空の rows でもレンダリングできる", () => {
    // Arrange
    const headers = ["Col"];
    const rows: string[][] = [];

    // Act & Assert
    expect(() => DataTable({ headers, rows })).not.toThrow();
  });

  it("ヘッダー行に accent カラーが適用される", () => {
    // Arrange
    const headers = ["Title"];
    const rows = [["data"]];

    // Act
    const element = DataTable({ headers, rows });

    // Assert — headerRow 内の cell Text に accent カラー
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    // children[1] = headerRow (Box)
    const headerRow = children[1];
    const headerCells = React.Children.toArray(
      headerRow.props.children,
    ) as React.ReactElement[];
    // Fragment 内の Text に accent カラーが設定されているはず
    // headerRow 内の React.Fragment → Text elements を走査
    const hasAccent = headerCells.some((cell) => {
      if (!cell.props?.children) return false;
      const innerChildren = React.Children.toArray(cell.props.children);
      return innerChildren.some(
        (c: any) => c.props?.color === colors.accent,
      );
    });
    expect(hasAccent).toBe(true);
  });
});
