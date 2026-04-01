/**
 * Header Component
 * ボーダー付きヘッダーを Ink で描画する。printHeader 相当。
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";

interface HeaderProps {
  readonly title: string;
  readonly width?: number;
}

export function Header({ title, width }: HeaderProps): React.JSX.Element {
  const theme = useTheme();
  const { borders, colors } = theme;
  const innerWidth = Math.min(width ?? (process.stdout.columns ?? 80) - 2, 60);

  const top = borders.topLeft + borders.horizontal.repeat(innerWidth) + borders.topRight;
  const bottom = borders.bottomLeft + borders.horizontal.repeat(innerWidth) + borders.bottomRight;
  const pad = Math.max(0, Math.floor((innerWidth - title.length) / 2));
  const titleContent = " ".repeat(pad) + title + " ".repeat(innerWidth - pad - title.length);
  const titleLine = borders.vertical + titleContent + borders.vertical;

  return (
    <Box flexDirection="column">
      <Text color={colors.primary}>{top}</Text>
      <Text color={colors.primary}>{titleLine}</Text>
      <Text color={colors.primary}>{bottom}</Text>
    </Box>
  );
}
