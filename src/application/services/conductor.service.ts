/**
 * Conductor Service
 * Stroke 実行結果を AI で評価し、次のアクションを決定する。
 */

import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parseStatusTag } from "../../domain/services/conductor-parser.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { PALETTES_DIR } from "../../shared/constants.js";
import { getBuiltinPalettePath } from "../../builtin/index.js";
import type { MediumExecutor } from "../ports/medium-executor.port.js";

export interface ConductorConfig {
  palette?: string;       // デフォルト: "conductor"
  rules: Array<{
    condition: string;    // "approved", "needs_fix" etc
    next: string | null;  // 次のstroke名 or null(完了)
  }>;
}

export interface ConductorResult {
  status: string;             // パースされたステータス
  nextStroke: string | null;  // rulesに基づく次のstroke
  rawResponse: string;        // AIの生レスポンス
}

/** Palette YAML の生データ型 */
interface RawPalette {
  readonly name: string;
  readonly description?: string;
  readonly persona: string;
}

/**
 * Conductor AI呼び出し。stroke実行結果を評価し、次のアクションを決定する。
 */
export async function runConductor(
  strokeResult: string,
  conductorConfig: ConductorConfig,
  mediumExecutor: MediumExecutor,
  defaultMedium: string,
  cwd: string,
  projectPath: string,
): Promise<ConductorResult> {
  // 1. Conductor palette 読み込み
  const paletteName = conductorConfig.palette ?? "conductor";
  const palette = await loadConductorPalette(paletteName, projectPath);

  // persona を取得（ビルトイン conductor のデフォルト）
  const persona = palette?.persona ?? buildBuiltinConductorPersona();

  // 2. 評価プロンプト合成
  const userInstruction = `以下はストロークの実行結果です。内容を評価し、[STATUS: xxx] 形式でステータスを判定してください。\n\n${strokeResult}`;
  const fullPrompt = `[Persona]\n${persona}\n\n${userInstruction}`;

  // 3. MediumExecutor 経由で呼び出し
  let rawResponse = "";
  try {
    const result = await mediumExecutor.execute({
      medium: defaultMedium,
      prompt: fullPrompt,
      workingDirectory: cwd,
      allowEdit: false,
      timeoutMs: 300_000,
    });

    if (result.exitCode === 0) {
      rawResponse = result.rawStdout;
    }
  } catch {
    // Medium 実行失敗時はデフォルト approved で返す
    return {
      status: "approved",
      nextStroke: findNextStroke(conductorConfig.rules, "approved"),
      rawResponse: "",
    };
  }

  // 4. parseStatusTag() でステータス取得
  const parsedStatus = parseStatusTag(rawResponse);

  // 5. ステータスが取得できなかった場合はデフォルトで "approved"
  const status = parsedStatus ?? "approved";

  // 6. rules から該当する condition を探して nextStroke を決定
  const nextStroke = findNextStroke(conductorConfig.rules, status);

  return {
    status,
    nextStroke,
    rawResponse,
  };
}

/**
 * rules から condition に一致するルールを探し、next を返す。
 * 一致するルールがなければ null を返す。
 */
function findNextStroke(
  rules: ConductorConfig["rules"],
  status: string,
): string | null {
  for (const rule of rules) {
    if (rule.condition === status) {
      return rule.next;
    }
  }
  return null;
}

/**
 * Conductor Palette YAML を読み込む。
 * プロジェクト固有 (.atelier/palettes/) > ビルトイン の優先順。
 */
async function loadConductorPalette(
  paletteName: string,
  projectPath: string,
): Promise<RawPalette | null> {
  // 1. プロジェクト固有パレットを探す
  const projectPalettePath = path.join(
    resolveAtelierPath(projectPath),
    PALETTES_DIR,
    `${paletteName}.yaml`,
  );
  if (await fileExists(projectPalettePath)) {
    try {
      const content = await readTextFile(projectPalettePath);
      return parseYaml(content) as RawPalette;
    } catch {
      // パース失敗時はビルトインにフォールバック
    }
  }

  // 2. ビルトインパレットを探す
  const builtinPath = getBuiltinPalettePath(paletteName);
  if (await fileExists(builtinPath)) {
    try {
      const content = await readTextFile(builtinPath);
      return parseYaml(content) as RawPalette;
    } catch {
      // パース失敗
    }
  }

  return null;
}

/**
 * ビルトイン conductor palette が見つからない場合のデフォルト persona。
 */
function buildBuiltinConductorPersona(): string {
  return [
    "あなたはワークフローのステータス判定を行う専門家です。",
    "前のステップの実行結果を分析し、ステータスタグを出力してください。",
    "",
    "ステータスタグの形式: [STATUS: タグ名]",
    "",
    "必ず最後にステータスタグを1つだけ出力してください。",
  ].join("\n");
}
