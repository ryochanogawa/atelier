/**
 * Claude Code CLI アダプター
 * `claude --print --output-format json` を使用してClaude Codeを呼び出す。
 * プロンプトは stdin 経由で渡し、プロセス引数への露出を防止する。
 */

import { execa, type ResultPromise } from "execa";
import type {
  MediumPort,
  MediumAvailability,
  MediumRequest,
  MediumResponse,
} from "./types.js";

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

  private buildArgs(request: MediumRequest): string[] {
    const args: string[] = ["--print"];

    if (request.systemPrompt) {
      args.push("--system-prompt", request.systemPrompt);
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    // プロンプトは直接引数として渡す（stdinだとCLIがハングする場合がある）
    args.push(request.prompt);

    return args;
  }

  private parseResponse(
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): MediumResponse {
    let content = "";
    let structured: Record<string, unknown> | undefined;
    let tokenUsage: { input: number; output: number } | undefined;

    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      content =
        typeof parsed.result === "string"
          ? parsed.result
          : typeof parsed.content === "string"
            ? parsed.content
            : stdout;
      structured = parsed;

      if (
        parsed.usage &&
        typeof parsed.usage === "object" &&
        parsed.usage !== null
      ) {
        const usage = parsed.usage as Record<string, unknown>;
        const input = Number(usage.input_tokens ?? usage.input ?? 0);
        const output = Number(usage.output_tokens ?? usage.output ?? 0);
        if (input > 0 || output > 0) {
          tokenUsage = { input, output };
        }
      }
    } catch {
      content = stdout;
    }

    return {
      content,
      structured,
      durationMs,
      tokenUsage,
      exitCode,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }
}
