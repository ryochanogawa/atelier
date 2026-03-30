/**
 * Prompt Preview Command
 * atelier prompt <commission> — Commission の各 stroke で送信されるプロンプトをプレビュー表示する。
 */

import { Command } from "commander";
import { COLORS } from "../theme.js";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Stroke } from "../../domain/models/stroke.model.js";
import { Canvas } from "../../domain/models/canvas.model.js";
import type { CommissionDefinition } from "../../shared/types.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  COMMISSIONS_DIR,
  PALETTES_DIR,
  POLICIES_DIR,
  CONTRACTS_DIR,
  INSTRUCTIONS_DIR,
  KNOWLEDGE_DIR,
} from "../../shared/constants.js";
import {
  getBuiltinPalettePath,
  getBuiltinPolicyPath,
  getBuiltinContractPath,
  getBuiltinInstructionPath,
  getBuiltinKnowledgePath,
} from "../../builtin/index.js";
import { printError } from "../output.js";

/* ------------------------------------------------------------------ */
/*  Palette / Policy / Contract / Knowledge / Instruction ローダー     */
/*  commission-runner.service.ts の private メソッド群と同等のロジック  */
/* ------------------------------------------------------------------ */

interface RawPalette {
  readonly name: string;
  readonly description?: string;
  readonly persona: string;
  readonly policies?: readonly string[];
}

interface RawPolicy {
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly { name: string; description?: string; content: string }[];
}

interface RawContract {
  readonly name: string;
  readonly description?: string;
  readonly format: string;
}

async function loadPalette(paletteName: string, projectPath: string): Promise<RawPalette | null> {
  const projectPalettePath = path.join(
    resolveAtelierPath(projectPath),
    PALETTES_DIR,
    `${paletteName}.yaml`,
  );
  if (await fileExists(projectPalettePath)) {
    try {
      const content = await readTextFile(projectPalettePath);
      return parseYaml(content) as RawPalette;
    } catch { /* fallback */ }
  }
  const builtinPath = getBuiltinPalettePath(paletteName);
  if (await fileExists(builtinPath)) {
    try {
      const content = await readTextFile(builtinPath);
      return parseYaml(content) as RawPalette;
    } catch { /* null */ }
  }
  return null;
}

async function loadPolicy(policyName: string, projectPath: string): Promise<RawPolicy | null> {
  const projectPolicyPath = path.join(
    resolveAtelierPath(projectPath),
    POLICIES_DIR,
    `${policyName}.yaml`,
  );
  if (await fileExists(projectPolicyPath)) {
    try {
      const content = await readTextFile(projectPolicyPath);
      return parseYaml(content) as RawPolicy;
    } catch { /* fallback */ }
  }
  const builtinPath = getBuiltinPolicyPath(policyName);
  if (await fileExists(builtinPath)) {
    try {
      const content = await readTextFile(builtinPath);
      return parseYaml(content) as RawPolicy;
    } catch { /* null */ }
  }
  return null;
}

async function loadPolicies(policyNames: readonly string[], projectPath: string): Promise<string[]> {
  const results: string[] = [];
  for (const policyName of policyNames) {
    const policy = await loadPolicy(policyName, projectPath);
    if (policy?.rules && policy.rules.length > 0) {
      const rulesText = policy.rules
        .map((r) => {
          const header = r.name ? `### ${r.name}` : "";
          return header ? `${header}\n${r.content}` : r.content;
        })
        .join("\n\n");
      results.push(rulesText);
    }
  }
  return results;
}

async function loadKnowledgeFile(name: string, projectPath: string): Promise<string | null> {
  const projectKnowledgePath = path.join(
    resolveAtelierPath(projectPath),
    KNOWLEDGE_DIR,
    `${name}.md`,
  );
  if (await fileExists(projectKnowledgePath)) {
    try { return await readTextFile(projectKnowledgePath); } catch { /* fallback */ }
  }
  const builtinPath = getBuiltinKnowledgePath(name);
  if (await fileExists(builtinPath)) {
    try { return await readTextFile(builtinPath); } catch { /* null */ }
  }
  return null;
}

async function loadKnowledgeFiles(knowledgeNames: readonly string[], projectPath: string): Promise<string[]> {
  const MAX_KNOWLEDGE_CHARS = 3000;
  const results: string[] = [];
  for (const name of knowledgeNames) {
    const content = await loadKnowledgeFile(name, projectPath);
    if (content) {
      const truncated = content.length > MAX_KNOWLEDGE_CHARS
        ? content.slice(0, MAX_KNOWLEDGE_CHARS) + "\n\n...(truncated)"
        : content;
      results.push(truncated);
    }
  }
  return results;
}

async function resolveInstruction(instruction: string, canvas: Canvas, projectPath: string): Promise<string> {
  const isFileRef = !instruction.includes("\n") && instruction.length <= 50 && !instruction.includes(".md");
  if (!isFileRef) {
    return expandTemplateVariables(instruction, canvas);
  }
  const name = instruction.trim();
  const projectInstructionPath = path.join(
    resolveAtelierPath(projectPath),
    INSTRUCTIONS_DIR,
    `${name}.md`,
  );
  if (await fileExists(projectInstructionPath)) {
    try {
      const content = await readTextFile(projectInstructionPath);
      return expandTemplateVariables(content, canvas);
    } catch { /* fallback */ }
  }
  const builtinPath = getBuiltinInstructionPath(name);
  if (await fileExists(builtinPath)) {
    try {
      const content = await readTextFile(builtinPath);
      return expandTemplateVariables(content, canvas);
    } catch { /* fallback */ }
  }
  return instruction;
}

async function loadContractFormat(contractName: string, canvas: Canvas, projectPath: string): Promise<string | null> {
  const contract = await loadContract(contractName, projectPath);
  if (!contract?.format) return null;
  return contract.format.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
    const value = canvas.get<string>(key);
    return value !== undefined ? value : `{{${key}}}`;
  });
}

async function loadContract(contractName: string, projectPath: string): Promise<RawContract | null> {
  const projectContractPath = path.join(
    resolveAtelierPath(projectPath),
    CONTRACTS_DIR,
    `${contractName}.yaml`,
  );
  if (await fileExists(projectContractPath)) {
    try {
      const content = await readTextFile(projectContractPath);
      return parseYaml(content) as RawContract;
    } catch { /* fallback */ }
  }
  const builtinPath = getBuiltinContractPath(contractName);
  if (await fileExists(builtinPath)) {
    try {
      const content = await readTextFile(builtinPath);
      return parseYaml(content) as RawContract;
    } catch { /* null */ }
  }
  return null;
}

function expandTemplateVariables(template: string, canvas: Canvas): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
    const value = canvas.get<string>(key);
    return value !== undefined ? value : `{{${key}}}`;
  });
}

/* ------------------------------------------------------------------ */
/*  composeFacetedPrompt — commission-runner.service.ts 相当            */
/* ------------------------------------------------------------------ */

interface FacetedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  /** 各ファセットを分割して保持（色分け表示用） */
  readonly facets: {
    readonly persona: string;
    readonly knowledge: string;
    readonly instruction: string;
    readonly contract: string;
    readonly policy: string;
  };
}

async function composeFacetedPrompt(
  stroke: Stroke,
  canvas: Canvas,
  projectPath: string,
): Promise<FacetedPrompt> {
  const palette = await loadPalette(stroke.palette, projectPath);

  const persona = palette?.persona ?? "";
  const parts: string[] = [];

  // 1. Canvas inputs
  for (const inputKey of stroke.inputs) {
    const value = canvas.get<string>(inputKey);
    if (value !== undefined) {
      parts.push(`[${inputKey}]\n${value}`);
    }
  }

  // 2. Knowledge
  let knowledgeText = "";
  if (stroke.knowledge.length > 0) {
    const knowledgeContents = await loadKnowledgeFiles(stroke.knowledge, projectPath);
    if (knowledgeContents.length > 0) {
      knowledgeText = knowledgeContents.join("\n\n---\n\n");
      parts.push(`[Knowledge]\n${knowledgeText}`);
    }
  }

  // 3. Instruction
  const instructionText = await resolveInstruction(stroke.instruction, canvas, projectPath);
  parts.push(instructionText);

  // 4. Contract
  let contractText = "";
  if (stroke.contract) {
    const contractContent = await loadContractFormat(stroke.contract, canvas, projectPath);
    if (contractContent) {
      contractText = contractContent;
      parts.push(`[Output Contract]\n${contractText}`);
    }
  }

  // 5. Policy
  let policyText = "";
  if (palette?.policies && palette.policies.length > 0) {
    const policyContents = await loadPolicies(palette.policies, projectPath);
    if (policyContents.length > 0) {
      policyText = policyContents.join("\n\n");
      parts.push(`[Policy]\n${policyText}`);
    }
  }

  return {
    systemPrompt: persona,
    userPrompt: parts.join("\n\n"),
    facets: {
      persona,
      knowledge: knowledgeText,
      instruction: instructionText,
      contract: contractText,
      policy: policyText,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  表示ロジック                                                       */
/* ------------------------------------------------------------------ */

function printFacetSection(label: string, content: string, colorFn: (s: string) => string): void {
  if (!content) return;
  console.log(colorFn(`── [${label}] ${"─".repeat(Math.max(0, 50 - label.length - 6))}`));
  console.log(content);
  console.log();
}

function printStrokePrompt(strokeName: string, prompt: FacetedPrompt): void {
  console.log();
  console.log(COLORS.accent.bold.underline(`Stroke: ${strokeName}`));
  console.log();

  // System Prompt (Persona)
  if (prompt.facets.persona) {
    console.log(COLORS.muted("=== System Prompt ==="));
    console.log();
    printFacetSection("Persona", prompt.facets.persona, COLORS.info);
  }

  // User Prompt
  console.log(COLORS.muted("=== User Prompt ==="));
  console.log();
  printFacetSection("Knowledge", prompt.facets.knowledge, COLORS.success);
  printFacetSection("Instruction", prompt.facets.instruction, COLORS.text);
  printFacetSection("Contract", prompt.facets.contract, COLORS.warning);
  printFacetSection("Policy", prompt.facets.policy, COLORS.error);
}

/* ------------------------------------------------------------------ */
/*  CLI コマンド定義                                                   */
/* ------------------------------------------------------------------ */

export function createPromptCommand(): Command {
  const prompt = new Command("prompt")
    .description("Commission のプロンプトをプレビュー表示する")
    .argument("<commission>", "Commission 名")
    .option("--stroke <name>", "特定の stroke のみ表示")
    .action(async (commissionName: string, opts: { stroke?: string }) => {
      const projectPath = process.cwd();

      try {
        // Commission YAML を読み込み
        const atelierPath = resolveAtelierPath(projectPath);
        const commissionPath = path.join(
          atelierPath,
          COMMISSIONS_DIR,
          `${commissionName}.yaml`,
        );

        if (!(await fileExists(commissionPath))) {
          printError(`Commission ファイルが見つかりません: ${commissionPath}`);
          process.exitCode = 1;
          return;
        }

        const content = await readTextFile(commissionPath);
        const commission = parseYaml(content) as CommissionDefinition;

        if (!commission?.strokes || commission.strokes.length === 0) {
          printError("Commission に stroke が定義されていません");
          process.exitCode = 1;
          return;
        }

        // Stroke モデルに変換
        const strokes = commission.strokes.map(
          (sd) =>
            new Stroke({
              name: sd.name,
              palette: sd.palette ?? "",
              medium: sd.medium ?? "claude-code",
              allowEdit: sd.allow_edit ?? false,
              instruction: sd.instruction ?? "",
              inputs: [...(sd.inputs ?? [])],
              outputs: [...(sd.outputs ?? [])],
              transitions: (sd.transitions ?? []).map((t) => ({
                condition: t.condition,
                next: t.next,
                maxRetries: t.max_retries ?? 3,
                onMaxRetries: t.on_max_retries ?? "fail",
              })),
              dependsOn: sd.depends_on ? [...sd.depends_on] : [],
              contract: sd.contract ?? "",
              knowledge: sd.knowledge ? [...sd.knowledge] : [],
              parallel: sd.parallel ? [...sd.parallel] : undefined,
            }),
        );

        // フィルタリング
        const targetStrokes = opts.stroke
          ? strokes.filter((s) => s.name === opts.stroke)
          : strokes;

        if (targetStrokes.length === 0) {
          printError(`Stroke '${opts.stroke}' が見つかりません`);
          process.exitCode = 1;
          return;
        }

        // Canvas は空（プレビューなので実行時の値は利用不可）
        const canvas = new Canvas();

        console.log(COLORS.accent.bold(`Commission: ${commission.name}`));
        if (commission.description) {
          console.log(COLORS.muted(commission.description));
        }
        console.log(COLORS.muted(`Strokes: ${strokes.length} 件`));

        for (const stroke of targetStrokes) {
          if (stroke.parallel && stroke.parallel.length > 0) {
            // 並列ストロークの表示
            console.log();
            console.log(COLORS.accent.bold.underline(`Stroke: ${stroke.name} (parallel)`));
            console.log();
            console.log(COLORS.muted(`  並列サブストローク: ${stroke.parallel.length} 件`));
            for (const sub of stroke.parallel) {
              console.log(COLORS.accent(`  - ${sub.name} (palette: ${sub.palette})`));
              console.log(COLORS.muted(`    instruction: ${sub.instruction.trim().split("\n")[0]}`));
            }
            if (stroke.inputs.length > 0) {
              console.log(COLORS.muted(`  inputs: ${stroke.inputs.join(", ")}`));
            }
            if (stroke.outputs.length > 0) {
              console.log(COLORS.muted(`  outputs: ${stroke.outputs.join(", ")}`));
            }
            console.log();
          } else {
            const prompt = await composeFacetedPrompt(stroke, canvas, projectPath);
            printStrokePrompt(stroke.name, prompt);
          }
        }
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
    });

  return prompt;
}
