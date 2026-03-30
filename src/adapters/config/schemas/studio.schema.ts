/**
 * StudioConfig Zod スキーマ
 * .atelier/studio.yaml の構造を定義する。
 */

import { z } from "zod";

export const MediumConfigSchema = z.object({
  name: z.string().min(1),
  timeout: z.number().positive().default(300_000),
  allowEdit: z.boolean().default(false),
  extraArgs: z.array(z.string()).optional(),
});

export const StrokeConfigSchema = z.object({
  name: z.string().min(1),
  medium: z.string().min(1),
  commission: z.string().min(1),
  palette: z.string().optional(),
  retries: z.number().int().min(0).default(0),
  dependsOn: z.array(z.string()).optional(),
});

export const PaletteProviderConfigSchema = z.object({
  medium: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const PipelineConfigSchema = z.object({
  branch_prefix: z.string().optional(),
  commit_message_template: z.string().optional(),
  pr_title_template: z.string().optional(),
  pr_body_template: z.string().optional(),
  slack_webhook_url: z.string().url().optional(),
});

export const StudioConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().default("1.0"),
  mediums: z.array(MediumConfigSchema).min(1),
  strokes: z.array(StrokeConfigSchema).min(1),
  policies: z.array(z.string()).optional(),
  outputDir: z.string().default(".atelier/output"),
  maxConcurrency: z.number().int().positive().default(1),
  concurrency: z.number().int().min(1).max(10).default(1),
  baseBranch: z.string().optional(),
  minimalOutput: z.boolean().default(false),
  pipeline: PipelineConfigSchema.optional(),
  palette_providers: z.record(z.string(), PaletteProviderConfigSchema).optional(),
});

export type StudioConfig = z.infer<typeof StudioConfigSchema>;
export type MediumConfig = z.infer<typeof MediumConfigSchema>;
export type StrokeConfig = z.infer<typeof StrokeConfigSchema>;
