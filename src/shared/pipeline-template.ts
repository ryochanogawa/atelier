/**
 * Pipeline Template Utility
 * テンプレート文字列中の {{variable}} を展開する純粋関数群。
 */

import type { PipelineConfig, PipelineTemplateVars } from "./types.js";

/** デフォルトのブランチプレフィックス */
const DEFAULT_BRANCH_PREFIX = "atelier/";

/** デフォルトのコミットメッセージテンプレート */
const DEFAULT_COMMIT_MESSAGE_TEMPLATE = "atelier: {{commission}} ({{task}})";

/** デフォルトの PR タイトルテンプレート */
const DEFAULT_PR_TITLE_TEMPLATE = "atelier: {{commission}} ({{task}})";

/**
 * テンプレート文字列中の {{key}} をマッピングで置換する。
 * 未定義の変数はそのまま残す。
 */
export function expandTemplate(
  template: string,
  vars: PipelineTemplateVars,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key as keyof PipelineTemplateVars];
    return value !== undefined ? value : match;
  });
}

/**
 * ブランチプレフィックスを取得する。
 */
export function getBranchPrefix(config?: PipelineConfig): string {
  return config?.branchPrefix ?? DEFAULT_BRANCH_PREFIX;
}

/**
 * コミットメッセージを生成する。
 * テンプレートが未設定の場合はデフォルトテンプレートを使用。
 */
export function buildCommitMessage(
  vars: PipelineTemplateVars,
  config?: PipelineConfig,
): string {
  const template =
    config?.commitMessageTemplate ?? DEFAULT_COMMIT_MESSAGE_TEMPLATE;
  return expandTemplate(template, vars);
}

/**
 * PR タイトルを生成する。
 * テンプレートが未設定の場合はデフォルトテンプレートを使用。
 */
export function buildPRTitle(
  vars: PipelineTemplateVars,
  config?: PipelineConfig,
): string {
  const template = config?.prTitleTemplate ?? DEFAULT_PR_TITLE_TEMPLATE;
  const expanded = expandTemplate(template, vars);
  // 100文字で切り詰め
  return expanded.length > 100 ? expanded.slice(0, 100) + "..." : expanded;
}

/**
 * PR 本文を生成する。
 * テンプレートが設定されている場合はそれを展開し、未設定の場合は null を返す
 * （呼び出し元でデフォルトの本文生成ロジックを使用するため）。
 */
export function buildPRBody(
  vars: PipelineTemplateVars,
  config?: PipelineConfig,
): string | null {
  if (!config?.prBodyTemplate) {
    return null;
  }
  return expandTemplate(config.prBodyTemplate, vars);
}

/**
 * 現在の日付を YYYY-MM-DD 形式で取得する。
 */
export function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * テンプレート変数を構築する。
 */
export function buildTemplateVars(params: {
  task?: string;
  commission: string;
  branch: string;
}): PipelineTemplateVars {
  return {
    task: params.task ?? params.commission,
    commission: params.commission,
    branch: params.branch,
    date: getTodayString(),
  };
}
