/**
 * Intent Enhancement Value Objects
 * プロンプト強化・意図推定に関する型定義。
 */

/** 強化済みプロンプト */
export interface EnhancedPrompt {
  readonly original: string;
  readonly enhanced: string;
  readonly addedContexts: AddedContext[];
  readonly confidenceScore: number;
}

/** 追加されたコンテキスト */
export interface AddedContext {
  readonly category: string;
  readonly content: string;
  readonly reason: string;
}

/** Palette提案 */
export interface PaletteSuggestion {
  readonly name: string;
  readonly description: string;
  readonly score: number;
  readonly reason: string;
}

/** Commission提案 */
export interface CommissionSuggestion {
  readonly name: string;
  readonly description: string;
  readonly score: number;
  readonly reason: string;
}
