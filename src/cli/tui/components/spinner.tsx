/**
 * Spinner Component
 * Ink Spinner でテーマ対応の読み込みインジケータを描画する。
 */

import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

interface SpinnerProps {
  readonly text: string;
}

export function Spinner({ text }: SpinnerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color={colors.warning}>{SPINNER_FRAMES[frame]} </Text>
      <Text>{text}</Text>
    </Text>
  );
}
