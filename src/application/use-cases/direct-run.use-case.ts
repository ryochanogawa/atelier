/**
 * DirectRun Use Case
 * タスク文字列を直接 AI Medium に渡して実行する。
 * Commission を経由せず、Palette(persona) と Policy を自動適用する。
 */

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { runSubprocess } from "../../infrastructure/process/subprocess.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  STUDIO_CONFIG_FILE,
  PALETTES_DIR,
  POLICIES_DIR,
} from "../../shared/constants.js";
import {
  getBuiltinPalettePath,
  getBuiltinPolicyPath,
} from "../../builtin/index.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";

/** Palette YAML の生データ型 */
interface RawPalette {
  readonly name: string;
  readonly description?: string;
  readonly persona: string;
  readonly policies?: readonly string[];
}

/** Policy YAML の生データ型 */
interface RawPolicy {
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly { name: string; description?: string; content: string }[];
}

export interface DirectRunOptions {
  /** 使用する Medium 名（省略時は studio.yaml の defaultMedium） */
  readonly medium?: string;
  /** ドライラン（プロンプトを表示するだけで実行しない） */
  readonly dryRun?: boolean;
  /** 使用する Palette 名（デフォルト: coder） */
  readonly palette?: string;
  /** worktree パス（指定された場合はその中で実行する） */
  readonly worktreePath?: string;
}

export interface DirectRunResult {
  readonly status: "completed" | "failed";
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly duration: number;
  readonly prompt: string;
}

export class DirectRunUseCase {
  /**
   * タスクを直接 AI に実行させる。
   */
  async execute(
    task: string,
    projectPath: string,
    options: DirectRunOptions = {},
  ): Promise<DirectRunResult> {
    const paletteName = options.palette ?? "coder";

    // 1. studio.yaml から設定を読み込み
    const studioConfig = await this.loadStudioConfig(projectPath);
    const mediumName = options.medium ?? studioConfig.defaultMedium;
    const mediaConfig = await this.loadMediaConfig(projectPath);
    const mediumConfig = mediaConfig[mediumName];

    if (!mediumConfig) {
      throw new Error(
        `Medium '${mediumName}' が見つかりません。studio.yaml の media セクションを確認してください。`,
      );
    }

    // 2. Palette（persona）を読み込み
    const palette = await this.loadPalette(paletteName, projectPath);

    // 3. Policy を読み込み
    const policyTexts: string[] = [];
    if (palette?.policies && palette.policies.length > 0) {
      for (const policyName of palette.policies) {
        const policy = await this.loadPolicy(policyName, projectPath);
        if (policy?.rules && policy.rules.length > 0) {
          const rulesText = policy.rules
            .map((r) => {
              const header = r.name ? `### ${r.name}` : "";
              return header ? `${header}\n${r.content}` : r.content;
            })
            .join("\n\n");
          policyTexts.push(rulesText);
        }
      }
    }

    // 4. ファセットプロンプティングでプロンプトを構成
    const parts: string[] = [];

    if (palette?.persona) {
      parts.push(`[Persona]\n${palette.persona}`);
    }

    parts.push(`[Task]\n${task}`);

    if (policyTexts.length > 0) {
      parts.push(`[Policy]\n${policyTexts.join("\n\n")}`);
    }

    const fullPrompt = parts.join("\n\n");

    // ドライランの場合はプロンプトを返すだけ
    if (options.dryRun) {
      return {
        status: "completed",
        stdout: "",
        stderr: "",
        exitCode: 0,
        duration: 0,
        prompt: fullPrompt,
      };
    }

    // 5. プロンプトを一時ファイルに書き出し
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    await fs.writeFile(promptFile, fullPrompt, "utf-8");

    // 6. シェルコマンドで実行
    const command = mediumConfig.command;
    const args = [...mediumConfig.args];
    const isCodex = command === "codex" || mediumName === "codex";

    if (isCodex) {
      // Codex: `codex exec --full-auto` で非対話実行
      if (!args.includes("exec")) {
        args.unshift("exec");
      }
      args.push("--full-auto");
    } else {
      // Claude Code（デフォルト）
      if (!args.includes("--print") && !args.includes("-p")) {
        args.unshift("-p");
      }
      if (!args.includes("--dangerously-skip-permissions")) {
        args.push("--dangerously-skip-permissions");
      }
    }

    const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const shellCmd = `cat ${escapeShell(promptFile)} | ${command} ${args.map(escapeShell).join(" ")}`;

    // worktreePath が指定されていればその中で実行する
    const execCwd = options.worktreePath ?? projectPath;

    let result;
    try {
      result = await runSubprocess(
        "bash",
        ["-c", shellCmd],
        { cwd: execCwd, timeout: 600_000 },
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    return {
      status: result.exitCode === 0 ? "completed" : "failed",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
      prompt: fullPrompt,
    };
  }

  private async loadStudioConfig(projectPath: string): Promise<StudioConfig> {
    const configPath = path.join(
      resolveAtelierPath(projectPath),
      STUDIO_CONFIG_FILE,
    );
    try {
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const studio = parsed.studio as Record<string, unknown>;
      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
      };
    } catch {
      // studio.yaml が見つからない場合はデフォルト値を返す
      return {
        defaultMedium: "claude-code",
        language: "ja",
        logLevel: "info",
      };
    }
  }

  private async loadMediaConfig(
    projectPath: string,
  ): Promise<Record<string, MediumConfig>> {
    const configPath = path.join(
      resolveAtelierPath(projectPath),
      STUDIO_CONFIG_FILE,
    );
    try {
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const media = (parsed.media ?? {}) as Record<string, Record<string, unknown>>;
      const result: Record<string, MediumConfig> = {};
      for (const [name, config] of Object.entries(media)) {
        result[name] = {
          command: (config.command as string) ?? name,
          args: ((config.args as string[]) ?? []),
        };
      }
      return result;
    } catch {
      // studio.yaml が見つからない場合はデフォルトの claude-code を返す
      return {
        "claude-code": {
          command: "claude",
          args: [],
        },
      };
    }
  }

  private async loadPalette(
    paletteName: string,
    projectPath: string,
  ): Promise<RawPalette | null> {
    // 1. プロジェクト固有
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
        // フォールバック
      }
    }

    // 2. ビルトイン
    const builtinPath = getBuiltinPalettePath(paletteName);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return parseYaml(content) as RawPalette;
      } catch {
        // null
      }
    }

    return null;
  }

  private async loadPolicy(
    policyName: string,
    projectPath: string,
  ): Promise<RawPolicy | null> {
    // 1. プロジェクト固有
    const projectPolicyPath = path.join(
      resolveAtelierPath(projectPath),
      POLICIES_DIR,
      `${policyName}.yaml`,
    );
    if (await fileExists(projectPolicyPath)) {
      try {
        const content = await readTextFile(projectPolicyPath);
        return parseYaml(content) as RawPolicy;
      } catch {
        // フォールバック
      }
    }

    // 2. ビルトイン
    const builtinPath = getBuiltinPolicyPath(policyName);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return parseYaml(content) as RawPolicy;
      } catch {
        // null
      }
    }

    return null;
  }
}
