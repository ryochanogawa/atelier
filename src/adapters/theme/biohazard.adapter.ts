/**
 * Biohazard Theme Adapter
 * デフォルトテーマ。現行 theme.ts の値を ThemePort 準拠で再実装。
 */

import type { ThemePort } from "../../domain/ports/theme.port.js";

export const BIOHAZARD_THEME: ThemePort = {
  meta: {
    name: "biohazard",
    displayName: "Biohazard",
    version: "1.0.0",
    description: "ATELIER デフォルトテーマ — バイオハザードスタイル",
  },
  colors: {
    primary: "#CC0000",
    secondary: "#1A472A",
    accent: "#D4A017",
    muted: "#4A4A4A",
    text: "#C0C0C0",
    success: "#2ECC40",
    error: "#FF4136",
    warning: "#FF851B",
    info: "#7FDBFF",
  },
  symbols: {
    brand: "\u2623",
    success: "\u2623",
    error: "\u2715",
    warning: "\u26A0",
    info: "\u25B8",
    bullet: "\u203A",
    arrow: "\u25B8",
    line: "\u2550",
  },
  borders: {
    topLeft: "\u2554",
    topRight: "\u2557",
    bottomLeft: "\u255A",
    bottomRight: "\u255D",
    horizontal: "\u2550",
    vertical: "\u2551",
    titleLeft: "\u2563",
    titleRight: "\u2560",
  },
  tableStyle: {
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
  },
} as const;
