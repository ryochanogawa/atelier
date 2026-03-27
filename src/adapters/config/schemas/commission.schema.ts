/**
 * Commission Zod スキーマ
 * .atelier/commissions/<name>.yaml の構造を定義する。
 */

import { z } from "zod";

export const FacetSchema = z.object({
  kind: z.enum(["persona", "policy", "instruction", "knowledge", "contract"]),
  content: z.string().min(1),
  priority: z.number().int().default(0),
});

export const CritiqueSchema = z.object({
  enabled: z.boolean().default(false),
  medium: z.string().optional(),
  prompt: z.string().optional(),
  maxRetries: z.number().int().min(0).default(1),
});

export const TransitionYamlSchema = z.object({
  condition: z.string().min(1),
  next: z.string().min(1),
  max_retries: z.number().int().min(0).optional(),
  on_max_retries: z.enum(["fail", "skip", "continue"]).optional(),
});

export const StrokeYamlSchema = z.object({
  name: z.string().min(1),
  palette: z.string().min(1),
  medium: z.string().optional(),
  allow_edit: z.boolean().optional(),
  instruction: z.string().min(1),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  transitions: z.array(TransitionYamlSchema).optional(),
  depends_on: z.array(z.string()).optional(),
});

export const CommissionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  template: z.string().min(1),
  facets: z.array(FacetSchema).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  critique: CritiqueSchema.optional(),
  outputFormat: z.enum(["text", "json", "markdown"]).default("text"),
  strokes: z.array(StrokeYamlSchema).optional(),
});

export type Commission = z.infer<typeof CommissionSchema>;
export type Facet = z.infer<typeof FacetSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type StrokeYaml = z.infer<typeof StrokeYamlSchema>;
export type TransitionYaml = z.infer<typeof TransitionYamlSchema>;
