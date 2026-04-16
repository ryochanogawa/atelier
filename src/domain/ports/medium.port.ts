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

/**
 * Medium が対応する機能の宣言。
 * 各アダプターが自身のサポート範囲を明示することで、
 * silent failure を防ぎ、agent-agnostic なオーケストレーションを実現する。
 */
export interface MediumCapabilities {
  /** --allowedTools 等のツール指定フラグに対応しているか */
  readonly allowedTools: boolean;
  /** MCP サーバー経由のツール呼び出しに対応しているか */
  readonly mcpTools: boolean;
  /** システムプロンプトの注入に対応しているか */
  readonly systemPrompt: boolean;
  /** ネットワークアクセスが可能か（sandbox 制限の有無） */
  readonly networkAccess: boolean;
  /** 対応しているサンドボックスレベル */
  readonly sandboxLevels: readonly string[];
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
  readonly capabilities: MediumCapabilities;
  checkAvailability(): Promise<MediumAvailability>;
  execute(request: MediumExecuteRequest): Promise<MediumExecuteResponse>;
  abort(): Promise<void>;
}
