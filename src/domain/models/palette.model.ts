/**
 * Palette Model
 * ペルソナ定義。AIエージェントの振る舞いを構成するファセットの集合。
 */

import { type Facet, FacetKind } from "../value-objects/facet.vo.js";

export interface PaletteDefaults {
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface Palette {
  readonly name: string;
  readonly description: string;
  readonly persona: Facet;
  readonly policies: readonly Facet[];
  readonly defaults: PaletteDefaults;
}

export function createPalette(params: {
  name: string;
  description: string;
  persona: Facet;
  policies?: readonly Facet[];
  defaults?: PaletteDefaults;
}): Palette {
  if (!params.name.trim()) {
    throw new Error("Palette name must not be empty");
  }
  if (params.persona.kind !== FacetKind.Persona) {
    throw new Error("Palette persona facet must be of kind 'persona'");
  }
  return Object.freeze({
    name: params.name,
    description: params.description,
    persona: params.persona,
    policies: Object.freeze([...(params.policies ?? [])]),
    defaults: Object.freeze({ ...(params.defaults ?? {}) }),
  });
}
