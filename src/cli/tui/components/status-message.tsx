/**
 * Status Message Components
 * success/error/warning/info メッセージを Ink で描画する。
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

interface StatusMessageProps {
  readonly message: string;
}

export function SuccessMessage({ message }: StatusMessageProps): React.JSX.Element {
  const { colors, symbols } = useTheme();
  return <Text color={colors.success}>{symbols.success} {message}</Text>;
}

export function ErrorMessage({ message }: StatusMessageProps): React.JSX.Element {
  const { colors, symbols } = useTheme();
  return <Text color={colors.error}>{symbols.error} {message}</Text>;
}

export function WarningMessage({ message }: StatusMessageProps): React.JSX.Element {
  const { colors, symbols } = useTheme();
  return <Text color={colors.warning}>{symbols.warning} {message}</Text>;
}

export function InfoMessage({ message }: StatusMessageProps): React.JSX.Element {
  const { colors, symbols } = useTheme();
  return <Text color={colors.info}>{symbols.info} {message}</Text>;
}
