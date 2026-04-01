/**
 * Section Divider Component
 * セクション区切りを Ink で描画する。printSectionDivider 相当。
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

interface SectionDividerProps {
  readonly title: string;
  readonly width?: number;
}

export function SectionDivider({ title, width }: SectionDividerProps): React.JSX.Element {
  const theme = useTheme();
  const { borders, colors } = theme;
  const totalWidth = Math.min(width ?? (process.stdout.columns ?? 80), 60);
  const inner = `${borders.titleLeft} ${title} ${borders.titleRight}`;
  const sideLen = Math.max(0, Math.floor((totalWidth - inner.length) / 2));
  const line = borders.horizontal.repeat(sideLen) + inner + borders.horizontal.repeat(sideLen);

  return <Text color={colors.accent}>{line}</Text>;
}
