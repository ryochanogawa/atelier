/**
 * CODEC Effects
 * メタルギアソリッド CODEC 通信画面のエフェクトを raw stdout で実現する。
 * Ink に依存しない純粋なターミナル操作。
 */

import type { ThemePort, ThemeAnimationDef, ThemeSoundDef } from "../domain/ports/theme.port.js";

// ─── ユーティリティ ─────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playBel(): void {
  process.stdout.write("\x07");
}

// ─── サウンド ───────────────────────────────────────────────

export function playSound(def: ThemeSoundDef | undefined): void {
  if (!def?.enabled) return;
  if (def.type === "bel") {
    playBel();
  }
}

/**
 * CODEC 着信音 — MGS の「ピピピ…ピピピ…」を BEL で再現。
 * 3 回の短いビープを 2 セット鳴らす。
 */
export async function codecRing(): Promise<void> {
  for (let set = 0; set < 2; set++) {
    for (let i = 0; i < 3; i++) {
      playBel();
      await sleep(120);
    }
    await sleep(300);
  }
}

// ─── タイプライター ─────────────────────────────────────────

/**
 * テキストを 1 文字ずつ stdout に書き出す。
 * アニメーション無効時は一括出力。
 */
export async function typewrite(
  text: string,
  def: ThemeAnimationDef | undefined,
): Promise<void> {
  if (!def?.enabled) {
    process.stdout.write(text);
    return;
  }

  const delayMs = def.durationMs; // 1 文字あたりの遅延

  for (const char of text) {
    process.stdout.write(char);
    if (char !== "\n") {
      await sleep(delayMs);
    }
  }
}

// ─── トランジション（通信開始） ──────────────────────────────

/** CODEC ノイズ文字（CRT スタティック風） */
const NOISE_CHARS = "░▒▓█▀▄▌▐│─┼╳╱╲◽◾";

/** スタティックノイズラインを生成 */
function randomNoiseLine(width: number): string {
  let line = "";
  for (let i = 0; i < width; i++) {
    line += NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
  }
  return line;
}

/**
 * 通信開始トランジション:
 * 1. CODEC 着信音 (ピピピ…ピピピ…)
 * 2. CRT スタティックノイズ → クリア
 */
export async function transitionIn(
  theme: ThemePort,
): Promise<void> {
  const def = theme.animations?.transitionIn;
  if (!def?.enabled) return;

  // Phase 1: 着信音
  await codecRing();

  // Phase 2: スタティックノイズ
  const width = Math.min(process.stdout.columns ?? 80, 70);
  const lines = 8;
  const totalFrames = 10;
  const frameDelay = Math.floor((def.durationMs - 800) / totalFrames); // 着信音分を除く

  // ノイズフェーズ: 強いノイズ → クリア
  for (let frame = 0; frame < totalFrames; frame++) {
    const noiseRatio = 1 - (frame / totalFrames) ** 0.5;
    const output: string[] = [];

    for (let row = 0; row < lines; row++) {
      if (Math.random() < noiseRatio) {
        // フレームが進むにつれてノイズの色を暗くしていく
        const g = Math.floor(255 * (1 - frame / totalFrames * 0.6));
        output.push(`\x1b[38;2;0;${g};20m${randomNoiseLine(width)}\x1b[0m`);
      } else {
        output.push(" ".repeat(width));
      }
    }

    if (frame > 0) {
      process.stdout.write(`\x1b[${lines}A`);
    }
    process.stdout.write(output.join("\n") + "\n");
    await sleep(Math.max(frameDelay, 30));
  }

  // ノイズ領域をクリア
  process.stdout.write(`\x1b[${lines}A`);
  for (let i = 0; i < lines; i++) {
    process.stdout.write(" ".repeat(width) + "\n");
  }
  process.stdout.write(`\x1b[${lines}A`);
}

/**
 * 通信終了トランジション:
 * ノイズ増加 → CODEC 切断音
 */
export async function transitionOut(
  theme: ThemePort,
): Promise<void> {
  const def = theme.animations?.transitionOut;
  if (!def?.enabled) return;

  const width = Math.min(process.stdout.columns ?? 80, 70);
  const lines = 4;
  const totalFrames = 6;
  const frameDelay = Math.floor(def.durationMs / totalFrames);

  for (let frame = 0; frame < totalFrames; frame++) {
    const noiseRatio = (frame / totalFrames) ** 0.7;
    const output: string[] = [];

    for (let row = 0; row < lines; row++) {
      if (Math.random() < noiseRatio) {
        const g = Math.floor(255 * (1 - frame / totalFrames * 0.5));
        output.push(`\x1b[38;2;0;${g};20m${randomNoiseLine(width)}\x1b[0m`);
      } else {
        output.push(" ".repeat(width));
      }
    }

    if (frame > 0) {
      process.stdout.write(`\x1b[${lines}A`);
    }
    process.stdout.write(output.join("\n") + "\n");
    await sleep(frameDelay);
  }

  // クリア
  process.stdout.write(`\x1b[${lines}A`);
  for (let i = 0; i < lines; i++) {
    process.stdout.write(" ".repeat(width) + "\n");
  }
  process.stdout.write(`\x1b[${lines}A`);
}

// ─── スキャンライン ──────────────────────────────────────────

/**
 * CRT スキャンライン演出 — 画面上を横切る水平走査線。
 */
export async function scanlineFlash(
  theme: ThemePort,
): Promise<void> {
  const def = theme.animations?.scanline;
  if (!def?.enabled) return;

  const width = Math.min(process.stdout.columns ?? 80, 70);

  // 二重スキャンライン（MGS の CRT 風）
  const thinLine = "─".repeat(width);
  const thickLine = "━".repeat(width);

  process.stdout.write(`\x1b[38;2;57;255;20m${thickLine}\x1b[0m\r`);
  await sleep(def.durationMs);
  process.stdout.write(`\x1b[38;2;27;67;50m${thinLine}\x1b[0m\r`);
  await sleep(def.durationMs / 2);
  process.stdout.write(" ".repeat(width) + "\r");
}
