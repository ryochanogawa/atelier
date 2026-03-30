/**
 * AIレスポンスから [STATUS: xxx] タグをパースする純粋関数。
 * Conductor判定で使用する。
 */
export function parseStatusTag(response: string): string | null {
  const match = response.match(/\[STATUS:\s*(\w+)\s*\]/i);
  return match ? match[1].toLowerCase() : null;
}
