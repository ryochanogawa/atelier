/**
 * Medium Port
 * AIプロバイダーとの通信ポート（インターフェースのみ）。
 */

export type {
  MediumInferenceConfig,
  MediumInferenceResponse,
} from "../value-objects/medium-config.vo.js";

export interface MediumAvailability {
  readonly available: boolean;
  readonly version?: string;
  readonly reason?: string;
}

export interface MediumExecuteRequest {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly workingDirectory: string;
  readonly allowEdit: boolean;
  readonly timeoutMs: number;
  readonly extraArgs?: readonly string[];
  readonly allowReadTools?: boolean;
  readonly allowedTools?: readonly string[];
}

export interface MediumExecuteResponse {
  readonly content: string;
  readonly structured?: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly tokenUsage?: { readonly input: number; readonly output: number };
  readonly exitCode: number;
  readonly rawStdout: string;
  readonly rawStderr: string;
}

export interface MediumPort {
  readonly name: string;
  checkAvailability(): Promise<MediumAvailability>;
  execute(request: MediumExecuteRequest): Promise<MediumExecuteResponse>;
  abort(): Promise<void>;
}
