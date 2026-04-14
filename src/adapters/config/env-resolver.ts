/**
 * 環境変数解決ユーティリティ
 * YAML設定ファイル内の ${VAR_NAME} 記法を環境変数の値に置換する。
 *
 * セキュリティ:
 * - 解決後の値はログに出力しない
 * - 結果をファイルに書き出さない
 */

import { readFileSync } from "node:fs";

/**
 * .env ファイルをパースして key-value マップを返す。
 * 存在しない場合は空のマップを返す。
 */
function loadDotEnv(envPath: string): Map<string, string> {
  const vars = new Map<string, string>();
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    return vars;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars.set(key, value);
  }
  return vars;
}

/**
 * テキスト中の ${VAR_NAME} を環境変数の値で置換する。
 *
 * 1. envPath が指定された場合、そのファイルを .env として読み込む
 * 2. .env に該当キーがなければ process.env から読む
 * 3. どちらにもない場合は空文字列に置換する
 *
 * @param text - 置換対象のテキスト
 * @param envPath - .env ファイルのパス（省略時は process.env のみ使用）
 * @returns 環境変数を解決済みのテキスト
 */
export function resolveEnvVars(text: string, envPath?: string): string {
  const dotEnv = envPath ? loadDotEnv(envPath) : new Map<string, string>();

  return text.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
    const name = varName.trim();
    // .env を優先、なければ process.env
    if (dotEnv.has(name)) {
      return dotEnv.get(name)!;
    }
    return process.env[name] ?? "";
  });
}
