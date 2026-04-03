/**
 * SubprocessMediumExecutor
 * MediumRegistry 経由でアダプタを選択し、subprocess で AI プロバイダーを実行する。
 * CommissionRunnerService の重複した subprocess 呼び出しロジックを集約する。
 */

import type { MediumRegistry } from "../../adapters/medium/medium-registry.js";
import type {
  MediumExecutor,
  MediumExecutionRequest,
  MediumExecutionResult,
} from "../ports/medium-executor.port.js";
import type { MediumExecuteRequest } from "../../domain/ports/medium.port.js";

export class SubprocessMediumExecutor implements MediumExecutor {
  constructor(private readonly registry: MediumRegistry) {}

  async execute(request: MediumExecutionRequest): Promise<MediumExecutionResult> {
    const adapter = this.registry.getOrThrow(request.medium);

    const adapterRequest: MediumExecuteRequest = {
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      workingDirectory: request.workingDirectory,
      allowEdit: request.allowEdit,
      timeoutMs: request.timeoutMs,
      extraArgs: this.buildExtraArgs(request),
      allowedTools: this.resolveAllowedTools(request),
    };

    const response = await adapter.execute(adapterRequest);

    return {
      content: response.content,
      exitCode: response.exitCode,
      durationMs: response.durationMs,
      tokenUsage: response.tokenUsage,
      rawStdout: response.rawStdout,
      rawStderr: response.rawStderr,
    };
  }

  listMedia(): string[] {
    return this.registry.listNames();
  }

  private buildExtraArgs(request: MediumExecutionRequest): string[] {
    const args: string[] = [];

    if (request.model) {
      args.push("--model", request.model);
    }

    if (request.extraArgs) {
      args.push(...request.extraArgs);
    }

    return args;
  }

  /**
   * allowedTools を解決する。
   * 各アダプタが自身の CLI に適した形式で使用する（Claude Code のみ対応）。
   */
  private resolveAllowedTools(request: MediumExecutionRequest): readonly string[] | undefined {
    if (request.allowedTools && request.allowedTools.length > 0) {
      return request.allowedTools;
    }
    if (request.permissionMode) {
      return this.resolvePermissionModeTools(request.permissionMode);
    }
    if (request.allowEdit) {
      return ["Edit", "Write", "Read", "Glob", "Grep", "Bash"];
    }
    return undefined;
  }

  private resolvePermissionModeTools(mode: "readonly" | "edit" | "full"): readonly string[] {
    switch (mode) {
      case "readonly":
        return ["Read", "Glob", "Grep"];
      case "edit":
        return ["Edit", "Write", "Read", "Glob", "Grep"];
      case "full":
        return ["Edit", "Write", "Read", "Glob", "Grep", "Bash"];
    }
  }
}
