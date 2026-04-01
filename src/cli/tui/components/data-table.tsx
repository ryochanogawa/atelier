/**
 * Data Table Component
 * テーマ対応のテーブル表示を Ink で描画する。printTable 相当。
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";

interface DataTableProps {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function DataTable({ headers, rows }: DataTableProps): React.JSX.Element {
  const { colors, borders } = useTheme();

  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.max(h.length, maxRow) + 2;
  });

  const renderRow = (cells: readonly string[], isHeader: boolean): React.JSX.Element => (
    <Box>
      <Text color={colors.primary}>{borders.vertical}</Text>
      {cells.map((cell, i) => {
        const padded = ` ${cell}${" ".repeat(Math.max(0, colWidths[i]! - cell.length - 1))}`;
        return (
          <React.Fragment key={i}>
            <Text color={isHeader ? colors.accent : undefined}>{padded}</Text>
            <Text color={colors.primary}>{borders.vertical}</Text>
          </React.Fragment>
        );
      })}
    </Box>
  );

  const horizontalLine = colWidths.map((w) => borders.horizontal.repeat(w)).join(borders.horizontal);
  const topLine = borders.topLeft + horizontalLine + borders.topRight;
  const bottomLine = borders.bottomLeft + horizontalLine + borders.bottomRight;

  return (
    <Box flexDirection="column">
      <Text color={colors.primary}>{topLine}</Text>
      {renderRow(headers, true)}
      <Text color={colors.primary}>{horizontalLine}</Text>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {renderRow(row, false)}
        </React.Fragment>
      ))}
      <Text color={colors.primary}>{bottomLine}</Text>
    </Box>
  );
}
