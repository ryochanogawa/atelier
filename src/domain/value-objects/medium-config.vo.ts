/**
 * MediumConfig Value Objects
 * AIプロバイダー（Medium）へのリクエスト/レスポンス型定義。
 */

export interface MediumRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stopSequences?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MediumResponse {
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
