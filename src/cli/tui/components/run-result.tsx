/**
 * Run Result Component
 * Commission 実行結果パネルを Ink で描画する。printRunResult 相当。
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import type { ThemePort } from "../../../domain/ports/theme.port.js";

interface RunResultProps {
  readonly runId: string;
  readonly commissionName: string;
  readonly status: string;
  readonly strokesExecuted: number;
  readonly strokesTotal: number;
  readonly duration: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly errors?: readonly { readonly strokeName: string; readonly message: string }[];
}

function getStatusColor(status: string, theme: ThemePort): string {
  switch (status) {
    case "completed":
      return theme.colors.success;
    case "failed":
      return theme.colors.error;
    default:
      return theme.colors.warning;
  }
}

function getStatusSymbol(status: string, theme: ThemePort): string {
  switch (status) {
    case "completed":
      return theme.symbols.success;
    case "failed":
      return theme.symbols.error;
    default:
      return theme.symbols.warning;
  }
}

export function RunResult(props: RunResultProps): React.JSX.Element {
  const theme = useTheme();
  const { borders, colors, symbols } = theme;
  const innerWidth = 56;

  const top = borders.topLeft + borders.horizontal.repeat(innerWidth) + borders.topRight;
  const bottom = borders.bottomLeft + borders.horizontal.repeat(innerWidth) + borders.bottomRight;
  const divider = borders.vertical + borders.horizontal.repeat(innerWidth) + borders.vertical;

  const statusColor = getStatusColor(props.status, theme);
  const statusSymbol = getStatusSymbol(props.status, theme);

  const padLine = (label: string, value: string): string => {
    const content = `  ${label}: ${value}`;
    const padding = Math.max(0, innerWidth - content.length);
    return borders.vertical + content + " ".repeat(padding) + borders.vertical;
  };

  const titleText = `${symbols.brand} Commission 実行結果`;
  const titlePad = Math.max(0, innerWidth - titleText.length);
  const titleLine = borders.vertical + titleText + " ".repeat(titlePad) + borders.vertical;

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text color={colors.primary}>{top}</Text>
      <Text color={colors.primary}>{titleLine}</Text>
      <Text color={colors.primary}>{divider}</Text>
      <Text>{padLine("Run ID", props.runId)}</Text>
      <Text>{padLine("Commission", props.commissionName)}</Text>
      <Text>{padLine("Status", `${statusSymbol} ${props.status}`)}</Text>
      <Text>{padLine("Strokes", `${props.strokesExecuted} / ${props.strokesTotal}`)}</Text>
      <Text>{padLine("Duration", props.duration)}</Text>
      <Text>{padLine("Started", props.startedAt)}</Text>
      <Text>{padLine("Completed", props.completedAt)}</Text>
      {props.errors && props.errors.length > 0 && (
        <>
          <Text color={colors.primary}>{divider}</Text>
          <Text color={colors.error}>{padLine(`${symbols.error} Errors`, "")}</Text>
          {props.errors.map((err, i) => (
            <Text key={i} color={colors.error}>
              {padLine(`  [${err.strokeName}]`, err.message)}
            </Text>
          ))}
        </>
      )}
      <Text color={colors.primary}>{bottom}</Text>
      <Text> </Text>
    </Box>
  );
}
