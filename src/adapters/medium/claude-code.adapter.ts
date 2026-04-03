/**
 * Claude Code CLI アダプター
 * `claude --print` を使用してClaude Codeを呼び出す。
 * プロバイダー共通インターフェースに準拠し、Claude固有のオプションは使用しない。
 */

import { execa, type ResultPromise } from "execa";
import type {
  MediumPort,
  MediumAvailability,
  MediumRequest,
  MediumResponse,
} from "./types.js";
import { runSubprocess } from "../../infrastructure/process/subprocess.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export class ClaudeCodeAdapter implements MediumPort {
  readonly name = "claude-code";

  private activeProcess: ResultPromise | null = null;

  async checkAvailability(): Promise<MediumAvailability> {
    try {
      const result = await execa("claude", ["--version"], { timeout: 10_000 });
      const version = result.stdout.trim();
      return { available: true, version };
    } catch (error) {
      return {
        available: false,
        reason:
          error instanceof Error ? error.message : "claude command not found",
      };
    }
  }

  async execute(request: MediumRequest): Promise<MediumResponse> {
    // 読み取りツールが要求されている場合は stdin パイプ + allowedTools 方式を使う
    if (request.allowReadTools) {
      return this.executeWithReadTools(request);
    }

    const args = this.buildArgs(request);
    const startTime = Date.now();

    try {
      this.activeProcess = execa("claude", args, {
        cwd: request.workingDirectory,
        timeout: request.timeoutMs,
        reject: false,
        stdin: "ignore",
      });

      const result = await this.activeProcess;
      const durationMs = Date.now() - startTime;

      return this.parseResponse(
        String(result.stdout ?? ""),
        String(result.stderr ?? ""),
        result.exitCode ?? 0,
        durationMs,
      );
    } finally {
      this.activeProcess = null;
    }
  }

  async abort(): Promise<void> {
    if (this.activeProcess) {
      this.activeProcess.kill("SIGTERM");
      this.activeProcess = null;
    }
  }

  /**
   * 読み取りツール (Read/Glob/Grep/Bash) を許可した実行。
   * プロンプトを一時ファイルに書き出し、cat | claude -p --allowedTools ... で実行する。
   */
  private async executeWithReadTools(request: MediumRequest): Promise<MediumResponse> {
    const startTime = Date.now();

    // プロンプトを一時ファイルに書き出し
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    await fs.writeFile(promptFile, request.prompt, "utf-8");

    // コマンド引数の組み立て
    const args: string[] = ["-p", "--dangerously-skip-permissions"];

    // 読み取り専用ツール + WebSearch/WebFetch を許可
    args.push("--allowedTools", "Read", "Glob", "Grep", "WebSearch", "WebFetch");

    if (request.systemPrompt) {
      args.push("--system-prompt", request.systemPrompt);
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const shellCmd = `cat ${escapeShell(promptFile)} | claude ${args.map(escapeShell).join(" ")}`;

    try {
      const result = await runSubprocess("bash", ["-c", shellCmd], {
        cwd: request.workingDirectory,
        timeout: request.timeoutMs,
      });

      const durationMs = Date.now() - startTime;

      return this.parseResponse(
        result.stdout,
        result.stderr,
        result.exitCode,
        durationMs,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private buildArgs(request: MediumRequest): string[] {
    const args: string[] = ["--print"];

    if (request.systemPrompt) {
      args.push("--system-prompt", request.systemPrompt);
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    args.push(request.prompt);

    return args;
  }

  private parseResponse(
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): MediumResponse {
    let content = stdout;

    // JSON出力の場合はパースを試みる
    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      content =
        typeof parsed.result === "string"
          ? parsed.result
          : typeof parsed.content === "string"
            ? parsed.content
            : stdout;
    } catch {
      // テキスト出力としてそのまま使用
    }

    return {
      content,
      durationMs,
      exitCode,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }
}
