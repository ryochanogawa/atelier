/**
 * Slide Plan DTO
 * AIが生成するスライド構成プランの構造化データ型。
 * 各スライドタイプに応じたコンテンツを定義する。
 */

import { z } from "zod";

// ── 個別スライドスキーマ ──

const CoverSlideSchema = z.object({
  slideType: z.literal("cover"),
  projectName: z.string(),
  subtitle: z.string().default(""),
  version: z.string().default(""),
  author: z.string().default(""),
  date: z.string().default(""),
});

const BenefitsSlideSchema = z.object({
  slideType: z.literal("benefits"),
  title: z.string().default("導入効果"),
  benefits: z.array(z.object({
    icon: z.string().default("✨"),
    text: z.string(),
  })).max(4),
});

const OverviewSlideSchema = z.object({
  slideType: z.literal("overview"),
  title: z.string().default("プロジェクト概要"),
  icon: z.string().default("📋"),
  body: z.string(),
});

const CardGridSlideSchema = z.object({
  slideType: z.literal("card-grid"),
  title: z.string(),
  cards: z.array(z.object({
    icon: z.string().default("💡"),
    heading: z.string(),
    subtext: z.string().default(""),
  })).max(6),
});

const DetailCardsSlideSchema = z.object({
  slideType: z.literal("detail-cards"),
  title: z.string(),
  cards: z.array(z.object({
    id: z.string().default(""),
    name: z.string(),
    description: z.string(),
    badge: z.string().default(""),
    badgeColor: z.enum(["orange", "green", "gray"]).default("gray"),
  })).max(3),
});

const SequenceActorSchema = z.object({
  name: z.string(),
  icon: z.string().default("👤"),
  color: z.enum(["red", "green", "orange", "blue", "purple", "teal"]).default("blue"),
});

const SequenceStepSchema = z.object({
  stepNumber: z.number(),
  fromActor: z.string(),
  toActor: z.string(),
  label: z.string(),
  sublabel: z.string().default(""),
  style: z.enum(["normal", "branch", "start", "end"]).default("normal"),
});

const SequenceDiagramSlideSchema = z.object({
  slideType: z.literal("sequence-diagram"),
  title: z.string(),
  summary: z.string().default(""),
  actors: z.array(SequenceActorSchema).min(2).max(5),
  steps: z.array(SequenceStepSchema).max(8),
});

const DataTableSlideSchema = z.object({
  slideType: z.literal("data-table"),
  title: z.string(),
  columns: z.array(z.string()).min(2).max(5),
  rows: z.array(z.array(z.string())).max(6),
});

const ScreenListSlideSchema = z.object({
  slideType: z.literal("screen-list"),
  title: z.string(),
  screens: z.array(z.object({
    icon: z.string().default("📋"),
    name: z.string(),
    description: z.string().default(""),
  })).max(4),
});

const ArchitectureSlideSchema = z.object({
  slideType: z.literal("architecture"),
  title: z.string(),
  description: z.string().default(""),
  actors: z.array(z.object({
    name: z.string(),
    icon: z.string().default("👤"),
    color: z.enum(["red", "green", "orange", "blue", "purple", "teal"]).default("blue"),
  })).min(2).max(5),
  relationships: z.array(z.object({
    label: z.string(),
    description: z.string().default(""),
    fromActors: z.array(z.string()),
    toActors: z.array(z.string()),
  })).max(4),
});

// ── 統合スキーマ ──

const SlideSchema = z.discriminatedUnion("slideType", [
  CoverSlideSchema,
  BenefitsSlideSchema,
  OverviewSlideSchema,
  CardGridSlideSchema,
  DetailCardsSlideSchema,
  SequenceDiagramSlideSchema,
  DataTableSlideSchema,
  ScreenListSlideSchema,
  ArchitectureSlideSchema,
]);

export const SlidePlanSchema = z.object({
  slides: z.array(SlideSchema),
});

// ── 型エクスポート ──

export type SlidePlanDto = z.infer<typeof SlidePlanSchema>;
export type SlideDescriptor = z.infer<typeof SlideSchema>;
export type CoverSlide = z.infer<typeof CoverSlideSchema>;
export type BenefitsSlide = z.infer<typeof BenefitsSlideSchema>;
export type OverviewSlide = z.infer<typeof OverviewSlideSchema>;
export type CardGridSlide = z.infer<typeof CardGridSlideSchema>;
export type DetailCardsSlide = z.infer<typeof DetailCardsSlideSchema>;
export type SequenceDiagramSlide = z.infer<typeof SequenceDiagramSlideSchema>;
export type DataTableSlide = z.infer<typeof DataTableSlideSchema>;
export type ScreenListSlide = z.infer<typeof ScreenListSlideSchema>;
export type ArchitectureSlide = z.infer<typeof ArchitectureSlideSchema>;

/**
 * AIの出力テキストからスライドプランJSONを抽出してパースする。
 */
export function parseSlidePlan(rawOutput: string): SlidePlanDto {
  let jsonStr = rawOutput;

  const codeBlockMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = rawOutput.slice(firstBrace, lastBrace + 1);
    }
  }

  const parsed = JSON.parse(jsonStr);
  const result = SlidePlanSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`スライドプランJSONのバリデーションに失敗しました: ${issues}`);
  }

  return result.data;
}
