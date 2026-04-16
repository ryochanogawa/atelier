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
import type { MediumExecuteRequest, MediumCapabilities } from "../../domain/ports/medium.port.js";

export interface CapabilityWarning {
  readonly medium: string;
  readonly capability: keyof MediumCapabilities;
  readonly message: string;
}

export class SubprocessMediumExecutor implements MediumExecutor {
  constructor(private readonly registry: MediumRegistry) {}

  async execute(request: MediumExecutionRequest): Promise<MediumExecutionResult> {
    const adapter = this.registry.getOrThrow(request.medium);

    // Capability バリデーション: silent failure を防止
    const warnings = this.validateCapabilities(request, adapter.capabilities);
    if (warnings.length > 0) {
      for (const w of warnings) {
        console.warn(`⚠️  [Atelier] ${w.message}`);
      }
    }

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

  /**
   * ストローク実行前に medium の capabilities とリクエスト内容を照合し、
   * 非対応機能の使用を検出する。silent failure を明示的な警告に変換する。
   */
  private validateCapabilities(
    request: MediumExecutionRequest,
    capabilities: MediumCapabilities,
  ): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];
    const medium = request.medium;

    // allowedTools 指定があるが medium が非対応
    if (request.allowedTools && request.allowedTools.length > 0 && !capabilities.allowedTools) {
      const mcpTools = request.allowedTools.filter((t) => t.startsWith("mcp__"));
      const otherTools = request.allowedTools.filter((t) => !t.startsWith("mcp__"));

      if (mcpTools.length > 0) {
        warnings.push({
          medium,
          capability: "mcpTools",
          message:
            `Medium "${medium}" does not support MCP tools. ` +
            `The following tools will be silently ignored: ${mcpTools.join(", ")}`,
        });
      }
      if (otherTools.length > 0) {
        warnings.push({
          medium,
          capability: "allowedTools",
          message:
            `Medium "${medium}" does not support --allowedTools. ` +
            `Tool restrictions will not be enforced: ${otherTools.join(", ")}`,
        });
      }
    }

    // systemPrompt 指定があるが medium が非対応
    if (request.systemPrompt && !capabilities.systemPrompt) {
      warnings.push({
        medium,
        capability: "systemPrompt",
        message:
          `Medium "${medium}" does not support system prompts. ` +
          `The system prompt will be silently ignored.`,
      });
    }

    // permissionMode でツール制御しようとしているが medium が allowedTools 非対応
    if (request.permissionMode && !capabilities.allowedTools) {
      warnings.push({
        medium,
        capability: "allowedTools",
        message:
          `Medium "${medium}" does not support tool-level permission control. ` +
          `permissionMode "${request.permissionMode}" will fall back to sandbox-level control only.`,
      });
    }

    return warnings;
  }
}
