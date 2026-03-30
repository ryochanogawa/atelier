/**
 * Theme Module
 * CLI UI のカラーパレット・シンボル・ボーダー・テーブルスタイルを集約。
 */

import chalk from "chalk";

export const COLORS = {
  primary: chalk.hex("#CC0000"),
  secondary: chalk.hex("#1A472A"),
  accent: chalk.hex("#D4A017"),
  muted: chalk.hex("#4A4A4A"),
  text: chalk.hex("#C0C0C0"),
  success: chalk.hex("#2ECC40"),
  error: chalk.hex("#FF4136"),
  warning: chalk.hex("#FF851B"),
  info: chalk.hex("#7FDBFF"),
} as const;

export const SYMBOLS = {
  biohazard: "\u2623",
  success: "\u2623",
  error: "\u2715",
  warning: "\u26A0",
  info: "\u25B8",
  bullet: "\u203A",
  arrow: "\u25B8",
  line: "\u2550",
} as const;

export const BORDERS = {
  topLeft: "\u2554",
  topRight: "\u2557",
  bottomLeft: "\u255A",
  bottomRight: "\u255D",
  horizontal: "\u2550",
  vertical: "\u2551",
  titleLeft: "\u2563",
  titleRight: "\u2560",
} as const;

export const TABLE_STYLE: Record<string, string> = {
  "top": "\u2550",
  "top-mid": "\u2564",
  "top-left": "\u2554",
  "top-right": "\u2557",
  "bottom": "\u2550",
  "bottom-mid": "\u2567",
  "bottom-left": "\u255A",
  "bottom-right": "\u255D",
  "left": "\u2551",
  "left-mid": "\u255F",
  "mid": "\u2500",
  "mid-mid": "\u253C",
  "right": "\u2551",
  "right-mid": "\u2562",
  "middle": "\u2502",
};
