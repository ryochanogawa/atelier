/**
 * Shared Utilities
 * プロジェクト全体で使用するユーティリティ関数。
 */

import { nanoid } from "nanoid";
import path from "node:path";
import { ATELIER_DIR, RUN_ID_PREFIX } from "./constants.js";
import { type RunId, asRunId } from "./types.js";

/**
 * nanoid ベースの RunId を生成する。
 */
export function generateRunId(): RunId {
  return asRunId(`${RUN_ID_PREFIX}${nanoid(12)}`);
}

/**
 * ミリ秒を人間が読みやすい形式に変換する。
 * 例: 65000 -> "1m 5s", 500 -> "0.5s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    return "0s";
  }

  const totalSeconds = ms / 1000;

  if (totalSeconds < 1) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/**
 * プロジェクトパスから .atelier ディレクトリの絶対パスを解決する。
 */
export function resolveAtelierPath(projectPath: string): string {
  return path.resolve(projectPath, ATELIER_DIR);
}

/**
 * 現在のタイムスタンプを ISO 形式で返す。
 */
export function timestamp(): string {
  return new Date().toISOString();
}
