/**
 * Codec Theme Adapter
 * メタルギアソリッド通信画面風テーマ。
 * グリーン基調のスキャンライン風カラーパレット。
 */

import type { ThemePort } from "../../domain/ports/theme.port.js";

/** USER 側 ASCII アバター — CODEC ポートレート風 */
const USER_AVATAR_LINES = [
  "╔════════════╗",
  "║   ╭────╮   ║",
  "║   │◉  ◉│   ║",
  "║   │ ── │   ║",
  "║   │╲__╱│   ║",
  "║   ╰────╯   ║",
  "║  ╱ ████ ╲  ║",
  "║ ╱ ██████ ╲ ║",
  "╚════════════╝",
] as const;

/** ATELIER (AI) 側 ASCII アバター — CODEC ポートレート風 */
const ATELIER_AVATAR_LINES = [
  "╔════════════╗",
  "║  ┌──────┐  ║",
  "║  │ ▣  ▣ │  ║",
  "║  │  ▰▰  │  ║",
  "║  │ ◈◈◈◈ │  ║",
  "║  └──────┘  ║",
  "║   ╱▓▓▓▓╲   ║",
  "║  ╱▓▓▓▓▓▓╲  ║",
  "╚════════════╝",
] as const;

export const CODEC_THEME: ThemePort = {
  meta: {
    name: "codec",
    displayName: "CODEC",
    version: "2.0.0",
    description: "Metal Gear Solid CODEC 通信風テーマ",
  },
  colors: {
    primary: "#39FF14",    // CODEC グリーン（メイン枠・ボーダー）
    secondary: "#0A1628",  // ダークネイビー（背景色）
    accent: "#7BFFB8",     // ライトグリーン（名前・周波数・ハイライト）
    muted: "#1B4332",      // ダークグリーン（セパレータ・非アクティブ）
    text: "#B8FFD4",       // CRT グリーン（通常テキスト）
    success: "#39FF14",    // 通信確立
    error: "#FF3030",      // 通信エラー・ALERT
    warning: "#FFB800",    // 警告シグナル
    info: "#5CFFAB",       // 情報表示
  },
  symbols: {
    brand: "▣",            // コーデック画面アイコン
    success: "▶",          // 通信確立
    error: "■",            // 通信切断
    warning: "▲",          // 警告シグナル
    info: "►",             // 情報受信
    bullet: "›",
    arrow: "▸",
    line: "─",
  },
  borders: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
    titleLeft: "╣",
    titleRight: "╠",
  },
  tableStyle: {
    "top": "─",
    "top-mid": "┬",
    "top-left": "┌",
    "top-right": "┐",
    "bottom": "─",
    "bottom-mid": "┴",
    "bottom-left": "└",
    "bottom-right": "┘",
    "left": "│",
    "left-mid": "├",
    "mid": "─",
    "mid-mid": "┼",
    "right": "│",
    "right-mid": "┤",
    "middle": "│",
  },

  // ─── CODEC 通信画面レイアウト ───────────────────────────
  layout: {
    preset: "codec",
    header: {
      label: "CODEC",
      frequency: "141.12",
    },
    userPanel: {
      name: "SNAKE",
      avatar: {
        lines: [...USER_AVATAR_LINES],
        width: 14,
        height: 9,
      },
    },
    assistantPanel: {
      name: "ATELIER",
      avatar: {
        lines: [...ATELIER_AVATAR_LINES],
        width: 14,
        height: 9,
      },
    },
  },

  // ─── アニメーション ─────────────────────────────────────
  animations: {
    typewriter: {
      enabled: true,
      durationMs: 20,     // 1文字あたり 20ms（無線通信のテンポ）
      easing: "step",
    },
    transitionIn: {
      enabled: true,
      durationMs: 1200,   // 着信音 + ノイズ演出 1.2秒
      easing: "ease-out",
    },
    transitionOut: {
      enabled: true,
      durationMs: 500,    // 通信終了ノイズ 0.5秒
      easing: "ease-in",
    },
    scanline: {
      enabled: true,
      durationMs: 80,     // スキャンライン間隔
      easing: "linear",
    },
  },

  // ─── サウンド ───────────────────────────────────────────
  sounds: {
    connect: {
      enabled: true,
      type: "bel",
    },
    disconnect: {
      enabled: true,
      type: "bel",
    },
  },
} as const;
