/**
 * Theme Validation Schema
 * npm パッケージから読み込んだテーマの Zod ランタイムバリデーション。
 */

import { z } from "zod";

const ThemeColorsSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().min(1),
  accent: z.string().min(1),
  muted: z.string().min(1),
  text: z.string().min(1),
  success: z.string().min(1),
  error: z.string().min(1),
  warning: z.string().min(1),
  info: z.string().min(1),
});

const ThemeSymbolsSchema = z.object({
  brand: z.string().min(1),
  success: z.string().min(1),
  error: z.string().min(1),
  warning: z.string().min(1),
  info: z.string().min(1),
  bullet: z.string().min(1),
  arrow: z.string().min(1),
  line: z.string().min(1),
});

const ThemeBordersSchema = z.object({
  topLeft: z.string().min(1),
  topRight: z.string().min(1),
  bottomLeft: z.string().min(1),
  bottomRight: z.string().min(1),
  horizontal: z.string().min(1),
  vertical: z.string().min(1),
  titleLeft: z.string().min(1),
  titleRight: z.string().min(1),
});

const ThemeMetaSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
});

// ─── Layout schemas ────────────────────────────────────

const ThemeAsciiAssetSchema = z.object({
  lines: z.array(z.string()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const ThemeLayoutHeaderSchema = z.object({
  label: z.string().min(1),
  frequency: z.string().optional(),
});

const ThemeLayoutPanelSchema = z.object({
  name: z.string().min(1),
  avatar: ThemeAsciiAssetSchema.optional(),
});

const ThemeLayoutSchema = z.object({
  preset: z.enum(["standard", "codec", "custom"]),
  header: ThemeLayoutHeaderSchema.optional(),
  userPanel: ThemeLayoutPanelSchema.optional(),
  assistantPanel: ThemeLayoutPanelSchema.optional(),
});

// ─── Animation schemas ─────────────────────────────────

const ThemeAnimationDefSchema = z.object({
  enabled: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  easing: z.enum(["linear", "ease-in", "ease-out", "step"]),
});

const ThemeAnimationsSchema = z.object({
  typewriter: ThemeAnimationDefSchema.optional(),
  transitionIn: ThemeAnimationDefSchema.optional(),
  transitionOut: ThemeAnimationDefSchema.optional(),
  scanline: ThemeAnimationDefSchema.optional(),
});

// ─── Sound schemas ─────────────────────────────────────

const ThemeSoundDefSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["bel", "file"]),
  path: z.string().optional(),
});

const ThemeSoundsSchema = z.object({
  connect: ThemeSoundDefSchema.optional(),
  disconnect: ThemeSoundDefSchema.optional(),
  messageReceive: ThemeSoundDefSchema.optional(),
});

// ─── Root schema ───────────────────────────────────────

export const ThemePortSchema = z.object({
  meta: ThemeMetaSchema,
  colors: ThemeColorsSchema,
  symbols: ThemeSymbolsSchema,
  borders: ThemeBordersSchema,
  tableStyle: z.record(z.string(), z.string()),
  layout: ThemeLayoutSchema.optional(),
  animations: ThemeAnimationsSchema.optional(),
  sounds: ThemeSoundsSchema.optional(),
});
