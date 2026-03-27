/**
 * Palette Zod スキーマ
 * .atelier/palettes/<name>.yaml の構造を定義する。
 */

import { z } from "zod";

export const PaletteEntrySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
});

export const PaletteSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entries: z.array(PaletteEntrySchema).min(1),
  extends: z.string().optional(),
});

export type Palette = z.infer<typeof PaletteSchema>;
export type PaletteEntry = z.infer<typeof PaletteEntrySchema>;
