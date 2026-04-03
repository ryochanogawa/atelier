/**
 * MediumInferenceConfig Value Objects
 * AIプロバイダー（Medium）の推論設定型定義。
 * 将来の HTTP API ベース Medium 実装で使用予定。
 */

export interface MediumInferenceConfig {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stopSequences?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MediumInferenceResponse {
  readonly content: string;
  readonly model: string;
  readonly usage: MediumUsage;
  readonly finishReason: MediumFinishReason;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MediumUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export type MediumFinishReason = "stop" | "max_tokens" | "error" | "abort";
