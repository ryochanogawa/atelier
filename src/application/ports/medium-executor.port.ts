/**
 * MediumExecutor Port
 * AIプロバイダー実行の抽象インターフェース。
 * CommissionRunnerService / ConductorService が依存するアプリケーション層ポート。
 */

export interface MediumExecutionRequest {
  readonly medium: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly workingDirectory: string;
  readonly allowEdit: boolean;
  readonly timeoutMs: number;
  readonly model?: string;
  readonly allowedTools?: readonly string[];
  readonly permissionMode?: "readonly" | "edit" | "full";
  readonly extraArgs?: readonly string[];
}

export interface MediumExecutionResult {
  readonly content: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly tokenUsage?: { readonly input: number; readonly output: number };
  readonly rawStdout: string;
  readonly rawStderr: string;
}

export interface MediumExecutor {
  execute(request: MediumExecutionRequest): Promise<MediumExecutionResult>;
  listMedia(): string[];
}
