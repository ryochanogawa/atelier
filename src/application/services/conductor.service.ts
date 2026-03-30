/**
 * Conductor Service
 * Stroke 実行結果を AI で評価し、次のアクションを決定する。
 */

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { parseStatusTag } from "../../domain/services/conductor-parser.js";
import { runSubprocess } from "../../infrastructure/process/subprocess.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { PALETTES_DIR } from "../../shared/constants.js";
import { getBuiltinPalettePath } from "../../builtin/index.js";
import type { MediumRegistry } from "./commission-runner.service.js";

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
  mediumRegistry: MediumRegistry,
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

  // 3. Medium 呼び出し
  const mediumConfig = mediumRegistry.getCommand(defaultMedium);
  if (!mediumConfig) {
    // Medium が見つからない場合はデフォルト approved で返す
    return {
      status: "approved",
      nextStroke: findNextStroke(conductorConfig.rules, "approved"),
      rawResponse: "",
    };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-conductor-"));
  const promptFile = path.join(tmpDir, "prompt.md");
  await fs.writeFile(promptFile, fullPrompt, "utf-8");

  const args = [...mediumConfig.args];
  if (!args.includes("--print") && !args.includes("-p")) {
    args.unshift("-p");
  }

  const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const shellCmd = `cat ${escapeShell(promptFile)} | ${mediumConfig.command} ${args.map(escapeShell).join(" ")}`;

  let rawResponse = "";
  try {
    const result = await runSubprocess(
      "bash",
      ["-c", shellCmd],
      { cwd, timeout: 300_000 },
    );

    if (result.exitCode === 0) {
      rawResponse = result.stdout;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // 4. parseStatusTag() でステータス取得
  const parsedStatus = parseStatusTag(rawResponse);

  // 6. ステータスが取得できなかった場合はデフォルトで "approved"
  const status = parsedStatus ?? "approved";

  // 5. rules から該当する condition を探して nextStroke を決定
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
