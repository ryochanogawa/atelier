/**
 * PromptComposer Domain Service
 * Faceted Prompting によるプロンプト合成。
 * Persona → システムプロンプト
 * Knowledge → Instruction → Contract → Policy → ユーザープロンプト
 */

import type { Stroke } from "../models/stroke.model.js";
import type { RunContext } from "../aggregates/run-context.aggregate.js";
import type { Palette } from "../models/palette.model.js";
import type { Facet } from "../value-objects/facet.vo.js";
import { FacetKind } from "../value-objects/facet.vo.js";

export interface ComposedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

/**
 * Markdown ペルソナデータ。
 * .md ファイルから読み込まれたペルソナ情報。
 */
export interface MarkdownPersona {
  readonly name: string;
  readonly persona: string;
  readonly policies: readonly string[];
}

export interface PromptComposerDeps {
  resolvePalette(name: string): Promise<Palette>;
  resolveMarkdownPalette?(name: string): Promise<MarkdownPersona | null>;
  resolveKnowledge?(strokeName: string): Promise<Facet[]>;
  resolveContract?(strokeName: string): Promise<Facet[]>;
}

export class PromptComposer {
  private readonly deps: PromptComposerDeps;

  constructor(deps: PromptComposerDeps) {
    this.deps = deps;
  }

  async compose(stroke: Stroke, runContext: RunContext): Promise<ComposedPrompt> {
    // Markdown ペルソナの解決を試みる
    let markdownPersona: MarkdownPersona | null = null;
    if (this.deps.resolveMarkdownPalette) {
      markdownPersona = await this.deps.resolveMarkdownPalette(stroke.palette);
    }

    // Markdown ペルソナが見つかった場合はそちらを使用
    if (markdownPersona) {
      return this.composeFromMarkdown(markdownPersona, stroke, runContext);
    }

    const palette = await this.deps.resolvePalette(stroke.palette);

    // Collect facets by kind
    const facets: Facet[] = [];

    // Persona is the system prompt
    const personaFacet = palette.persona;

    // Knowledge facets
    if (this.deps.resolveKnowledge) {
      const knowledgeFacets = await this.deps.resolveKnowledge(stroke.name);
      facets.push(...knowledgeFacets);
    }

    // Instruction facet from stroke
    if (stroke.instruction) {
      facets.push(
        Object.freeze({
          kind: FacetKind.Instruction,
          content: stroke.instruction,
          priority: 0,
        }),
      );
    }

    // Contract facets
    if (this.deps.resolveContract) {
      const contractFacets = await this.deps.resolveContract(stroke.name);
      facets.push(...contractFacets);
    }

    // Policy facets from palette
    facets.push(...palette.policies);

    // Build template context from canvas
    const templateContext = runContext.canvas.toJSON();

    // Compose system prompt (Persona)
    const systemPrompt = this.expandTemplate(personaFacet.content, templateContext);

    // Compose user prompt in order: Knowledge → Instruction → Contract → Policy
    const orderedKinds: FacetKind[] = [
      FacetKind.Knowledge,
      FacetKind.Instruction,
      FacetKind.Contract,
      FacetKind.Policy,
    ];

    const sections: string[] = [];
    for (const kind of orderedKinds) {
      const kindFacets = facets
        .filter((f) => f.kind === kind)
        .sort((a, b) => b.priority - a.priority);

      for (const facet of kindFacets) {
        const expanded = this.expandTemplate(facet.content, templateContext);
        sections.push(expanded);
      }
    }

    const userPrompt = sections.join("\n\n");

    return Object.freeze({ systemPrompt, userPrompt });
  }

  /**
   * Markdown ペルソナからプロンプトを合成する。
   */
  private async composeFromMarkdown(
    persona: MarkdownPersona,
    stroke: Stroke,
    runContext: RunContext,
  ): Promise<ComposedPrompt> {
    const facets: Facet[] = [];

    // Knowledge facets
    if (this.deps.resolveKnowledge) {
      const knowledgeFacets = await this.deps.resolveKnowledge(stroke.name);
      facets.push(...knowledgeFacets);
    }

    // Instruction facet from stroke
    if (stroke.instruction) {
      facets.push(
        Object.freeze({
          kind: FacetKind.Instruction,
          content: stroke.instruction,
          priority: 0,
        }),
      );
    }

    // Contract facets
    if (this.deps.resolveContract) {
      const contractFacets = await this.deps.resolveContract(stroke.name);
      facets.push(...contractFacets);
    }

    // Build template context from canvas
    const templateContext = runContext.canvas.toJSON();

    // Compose system prompt from markdown persona content
    const systemPrompt = this.expandTemplate(persona.persona, templateContext);

    // Compose user prompt
    const orderedKinds: FacetKind[] = [
      FacetKind.Knowledge,
      FacetKind.Instruction,
      FacetKind.Contract,
      FacetKind.Policy,
    ];

    const sections: string[] = [];
    for (const kind of orderedKinds) {
      const kindFacets = facets
        .filter((f) => f.kind === kind)
        .sort((a, b) => b.priority - a.priority);

      for (const facet of kindFacets) {
        const expanded = this.expandTemplate(facet.content, templateContext);
        sections.push(expanded);
      }
    }

    const userPrompt = sections.join("\n\n");

    return Object.freeze({ systemPrompt, userPrompt });
  }

  /**
   * Handlebars風テンプレート展開。
   * {{variable}} をCanvasの値で置換する。
   */
  private expandTemplate(
    template: string,
    context: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const value = this.resolvePath(context, path);
      if (value === undefined) return `{{${path}}}`;
      return String(value);
    });
  }

  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
