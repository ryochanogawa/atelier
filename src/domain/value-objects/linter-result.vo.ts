/**
 * LinterResult Value Object
 * Linter実行結果を表す値オブジェクト。
 */

export interface LinterResult {
  readonly tool: string;
  readonly file: string;
  readonly line: number;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly ruleId?: string;
}

/**
 * LinterResult を生成する。
 */
export function createLinterResult(params: {
  tool: string;
  file: string;
  line: number;
  severity: LinterResult["severity"];
  message: string;
  ruleId?: string;
}): LinterResult {
  return Object.freeze({
    tool: params.tool,
    file: params.file,
    line: params.line,
    severity: params.severity,
    message: params.message,
    ...(params.ruleId !== undefined ? { ruleId: params.ruleId } : {}),
  });
}
