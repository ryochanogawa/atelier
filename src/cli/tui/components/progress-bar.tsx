/**
 * Progress Bar Component
 * テーマ対応のプログレスバーを Ink で描画する。printProgressBar 相当。
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

interface ProgressBarProps {
  readonly current: number;
  readonly total: number;
  readonly label?: string;
  readonly width?: number;
}

export function ProgressBar({ current, total, label, width = 20 }: ProgressBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const suffix = label ? ` ${label}` : "";

  return (
    <Text color={colors.accent}>
      [{bar}] {current}/{total}{suffix}
    </Text>
  );
}
