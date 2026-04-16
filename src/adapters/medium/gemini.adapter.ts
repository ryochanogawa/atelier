/**
 * Google Gemini CLI アダプター
 * `gemini` コマンドを使用してGemini CLIを呼び出す。
 * プロンプトは stdin 経由で渡し、プロセス引数への露出を防止する。
 */

import { execa, type ResultPromise } from "execa";
import type {
  MediumPort,
  MediumCapabilities,
  MediumAvailability,
  MediumExecuteRequest,
  MediumExecuteResponse,
} from "../../domain/ports/medium.port.js";

export class GeminiAdapter implements MediumPort {
  readonly name = "gemini";

  readonly capabilities: MediumCapabilities = {
    allowedTools: false,
    mcpTools: false,
    systemPrompt: false,
    networkAccess: true,
    sandboxLevels: ["sandbox", "full"],
  };

  private activeProcess: ResultPromise | null = null;

  async checkAvailability(): Promise<MediumAvailability> {
    try {
      const result = await execa("gemini", ["--version"], { timeout: 10_000 });
      const version = result.stdout.trim();
      return { available: true, version };
    } catch (error) {
      return {
        available: false,
        reason:
          error instanceof Error ? error.message : "gemini command not found",
      };
    }
  }

  async execute(request: MediumExecuteRequest): Promise<MediumExecuteResponse> {
    const args = this.buildArgs(request);
    const startTime = Date.now();

    try {
      // プロンプトは stdin 経由で渡す（ps コマンドでの露出を防止）
      this.activeProcess = execa("gemini", args, {
        cwd: request.workingDirectory,
        timeout: request.timeoutMs,
        reject: false,
        input: request.prompt,
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

  private buildArgs(request: MediumExecuteRequest): string[] {
    // プロンプトは stdin から読み取るため、引数には含めない
    const args: string[] = [];

    if (!request.allowEdit) {
      args.push("--sandbox");
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    return args;
  }

  private parseResponse(
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): MediumExecuteResponse {
    let content = stdout.trim();
    let structured: Record<string, unknown> | undefined;

    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      content =
        typeof parsed.response === "string"
          ? parsed.response
          : typeof parsed.content === "string"
            ? parsed.content
            : content;
      structured = parsed;
    } catch {
      // テキスト出力としてそのまま使用
    }

    return {
      content,
      structured,
      durationMs,
      exitCode,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }
}
