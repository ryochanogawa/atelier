/**
 * OpenAI Codex CLI アダプター
 * `codex exec` を使用してCodexを非対話モードで呼び出す。
 * プロンプトは stdin 経由で渡し、プロセス引数への露出を防止する。
 */

import { execa, type ResultPromise } from "execa";
import type {
  MediumPort,
  MediumAvailability,
  MediumExecuteRequest,
  MediumExecuteResponse,
} from "../../domain/ports/medium.port.js";

export class CodexAdapter implements MediumPort {
  readonly name = "codex";

  private activeProcess: ResultPromise | null = null;

  async checkAvailability(): Promise<MediumAvailability> {
    try {
      const result = await execa("codex", ["--version"], { timeout: 10_000 });
      const version = result.stdout.trim();
      return { available: true, version };
    } catch (error) {
      return {
        available: false,
        reason:
          error instanceof Error ? error.message : "codex command not found",
      };
    }
  }

  async execute(request: MediumExecuteRequest): Promise<MediumExecuteResponse> {
    const args = this.buildArgs(request);
    const startTime = Date.now();

    try {
      // プロンプトは stdin 経由で渡す（ps コマンドでの露出を防止）
      this.activeProcess = execa("codex", args, {
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
    // `codex exec` サブコマンドで非対話実行
    const args: string[] = ["exec"];

    if (request.allowEdit) {
      args.push("--full-auto");
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    // プロンプトは stdin から読み取る（`-` を指定）
    args.push("-");

    return args;
  }

  private parseResponse(
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): MediumExecuteResponse {
    return {
      content: stdout.trim(),
      durationMs,
      exitCode,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  }
}
