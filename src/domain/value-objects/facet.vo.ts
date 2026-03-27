/**
 * Facet Value Object
 * Faceted Prompting の各ファセット種別と値を表現する。
 */

export const FacetKind = {
  Persona: "persona",
  Policy: "policy",
  Instruction: "instruction",
  Knowledge: "knowledge",
  Contract: "contract",
} as const;

export type FacetKind = (typeof FacetKind)[keyof typeof FacetKind];

export interface Facet {
  readonly kind: FacetKind;
  readonly content: string;
  readonly priority: number;
}

export function createFacet(
  kind: FacetKind,
  content: string,
  priority = 0,
): Facet {
  if (!content.trim()) {
    throw new Error(`Facet content must not be empty for kind "${kind}"`);
  }
  return Object.freeze({ kind, content, priority });
}
