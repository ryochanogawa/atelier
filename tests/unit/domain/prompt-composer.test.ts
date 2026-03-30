import { describe, it, expect, vi } from "vitest";
import {
  PromptComposer,
  type PromptComposerDeps,
  type MarkdownPersona,
} from "../../../src/domain/services/prompt-composer.service.js";
import { createFacet, FacetKind } from "../../../src/domain/value-objects/facet.vo.js";
import { createPalette } from "../../../src/domain/models/palette.model.js";
import { Stroke } from "../../../src/domain/models/stroke.model.js";
import { RunContext } from "../../../src/domain/aggregates/run-context.aggregate.js";
import { Canvas } from "../../../src/domain/models/canvas.model.js";
import { CommissionStatus } from "../../../src/domain/value-objects/commission-status.vo.js";

// ---- Helper factories ----

function makeStroke(overrides: Partial<{
  name: string;
  palette: string;
  instruction: string;
}>): Stroke {
  return new Stroke({
    name: overrides.name ?? "test-stroke",
    palette: overrides.palette ?? "test-palette",
    medium: "claude",
    allowEdit: false,
    instruction: overrides.instruction ?? "Default instruction",
    inputs: [],
    outputs: [],
    transitions: [],
    contract: "",
    knowledge: [],
  });
}

function makeRunContext(canvasData?: Record<string, unknown>): RunContext {
  return new RunContext({
    runId: "run-1",
    commissionName: "test-commission",
    canvas: canvasData ? new Canvas(canvasData) : new Canvas(),
    status: CommissionStatus.Running,
  });
}

function makePersonaFacet(content = "You are a helpful assistant.") {
  return createFacet(FacetKind.Persona, content);
}

function makeBasePalette(personaContent = "You are a helpful assistant.") {
  return createPalette({
    name: "test-palette",
    description: "A test palette",
    persona: makePersonaFacet(personaContent),
    policies: [],
  });
}

// ---- 1. 基本合成: Persona → systemPrompt、残りのファセット → userPrompt ----

describe("PromptComposer: 基本合成", () => {
  it("Persona ファセットの内容が systemPrompt に設定される", async () => {
    const personaContent = "You are a senior software engineer.";
    const palette = makeBasePalette(personaContent);

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Write tests." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe(personaContent);
  });

  it("Instruction の内容が userPrompt に含まれる", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Implement the feature." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toContain("Implement the feature.");
  });

  it("Persona の内容は userPrompt に含まれない", async () => {
    const personaContent = "You are a unique persona string XYZ.";
    const palette = makeBasePalette(personaContent);
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Do something." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).not.toContain(personaContent);
  });

  it("instruction が空の場合、userPrompt は空文字になる（policyもなければ）", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    // instruction を空に（Stroke は空文字を instruction として受け入れる）
    const stroke = new Stroke({
      name: "empty-stroke",
      palette: "test-palette",
      medium: "claude",
      allowEdit: false,
      instruction: "",
      inputs: [],
      outputs: [],
      transitions: [],
      contract: "",
    });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toBe("");
  });
});

// ---- 2. ファセット順序: Knowledge → Instruction → Contract → Policy ----

describe("PromptComposer: ファセット順序", () => {
  it("userPrompt に Knowledge → Instruction → Contract → Policy の順で含まれる", async () => {
    const knowledgeFacet = createFacet(FacetKind.Knowledge, "KNOWLEDGE_CONTENT");
    const contractFacet = createFacet(FacetKind.Contract, "CONTRACT_CONTENT");
    const policyFacet = createFacet(FacetKind.Policy, "POLICY_CONTENT");

    const palette = createPalette({
      name: "test-palette",
      description: "Test",
      persona: makePersonaFacet(),
      policies: [policyFacet],
    });

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      resolveKnowledge: vi.fn().mockResolvedValue([knowledgeFacet]),
      resolveContract: vi.fn().mockResolvedValue([contractFacet]),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "INSTRUCTION_CONTENT" });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    const knowledgeIdx = result.userPrompt.indexOf("KNOWLEDGE_CONTENT");
    const instructionIdx = result.userPrompt.indexOf("INSTRUCTION_CONTENT");
    const contractIdx = result.userPrompt.indexOf("CONTRACT_CONTENT");
    const policyIdx = result.userPrompt.indexOf("POLICY_CONTENT");

    expect(knowledgeIdx).toBeGreaterThanOrEqual(0);
    expect(instructionIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(policyIdx).toBeGreaterThanOrEqual(0);

    expect(knowledgeIdx).toBeLessThan(instructionIdx);
    expect(instructionIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(policyIdx);
  });

  it("同じ kind 内では priority 降順で並ぶ", async () => {
    const lowPriorityKnowledge = createFacet(FacetKind.Knowledge, "LOW_PRIORITY", 1);
    const highPriorityKnowledge = createFacet(FacetKind.Knowledge, "HIGH_PRIORITY", 10);

    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      resolveKnowledge: vi.fn().mockResolvedValue([lowPriorityKnowledge, highPriorityKnowledge]),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Do something." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    const highIdx = result.userPrompt.indexOf("HIGH_PRIORITY");
    const lowIdx = result.userPrompt.indexOf("LOW_PRIORITY");

    expect(highIdx).toBeLessThan(lowIdx);
  });
});

// ---- 3. Markdownペルソナ: resolveMarkdownPalette が値を返す場合、そちらが使われる ----

describe("PromptComposer: Markdownペルソナ", () => {
  it("resolveMarkdownPalette が MarkdownPersona を返す場合、persona.persona が systemPrompt になる", async () => {
    const markdownPersona: MarkdownPersona = {
      name: "md-persona",
      persona: "I am a markdown-based persona.",
      policies: [],
    };

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn(),
      resolveMarkdownPalette: vi.fn().mockResolvedValue(markdownPersona),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Do md work." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe("I am a markdown-based persona.");
    expect(deps.resolvePalette).not.toHaveBeenCalled();
  });

  it("resolveMarkdownPalette が null を返す場合、resolvePalette にフォールバックする", async () => {
    const palette = makeBasePalette("Fallback persona content.");

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      resolveMarkdownPalette: vi.fn().mockResolvedValue(null),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Do fallback work." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe("Fallback persona content.");
    expect(deps.resolvePalette).toHaveBeenCalledWith("test-palette");
  });

  it("resolveMarkdownPalette が未定義の場合、resolvePalette を使用する", async () => {
    const palette = makeBasePalette("No markdown persona available.");

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Standard instruction." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe("No markdown persona available.");
  });

  it("Markdownペルソナ使用時も instruction が userPrompt に含まれる", async () => {
    const markdownPersona: MarkdownPersona = {
      name: "md-persona",
      persona: "Markdown persona.",
      policies: [],
    };

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn(),
      resolveMarkdownPalette: vi.fn().mockResolvedValue(markdownPersona),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "MD instruction content." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toContain("MD instruction content.");
  });
});

// ---- 4. テンプレート展開: instruction内の {{key}} が RunContext の canvas 値で展開される ----

describe("PromptComposer: テンプレート展開", () => {
  it("{{key}} が Canvas の値で展開される", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Process {{target}} now." });
    const runContext = makeRunContext({ target: "file.ts" });

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toContain("Process file.ts now.");
    expect(result.userPrompt).not.toContain("{{target}}");
  });

  it("Canvas に存在しないキーは展開されずプレースホルダのまま残る", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Handle {{missing}} key." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toContain("{{missing}}");
  });

  it("systemPrompt（persona）内の {{key}} も展開される", async () => {
    const palette = makeBasePalette("You are working on {{project}}.");
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Proceed." });
    const runContext = makeRunContext({ project: "atelier" });

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe("You are working on atelier.");
  });

  it("複数の {{key}} が一度に展開される", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "From {{source}} to {{destination}}." });
    const runContext = makeRunContext({ source: "A", destination: "B" });

    const result = await composer.compose(stroke, runContext);

    expect(result.userPrompt).toContain("From A to B.");
  });

  it("Markdownペルソナ使用時も instruction の {{key}} が展開される", async () => {
    const markdownPersona: MarkdownPersona = {
      name: "md-persona",
      persona: "Persona for {{env}}.",
      policies: [],
    };

    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn(),
      resolveMarkdownPalette: vi.fn().mockResolvedValue(markdownPersona),
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Run in {{env}} mode." });
    const runContext = makeRunContext({ env: "production" });

    const result = await composer.compose(stroke, runContext);

    expect(result.systemPrompt).toBe("Persona for production.");
    expect(result.userPrompt).toContain("Run in production mode.");
  });
});

// ---- 5. deps mock: 各テストが独立している確認 ----

describe("PromptComposer: deps mock 独立性", () => {
  it("resolvePalette は compose 呼び出しごとに適切なパレット名で呼ばれる", async () => {
    const palette = makeBasePalette();
    const resolvePalette = vi.fn().mockResolvedValue(palette);
    const deps: PromptComposerDeps = { resolvePalette };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ palette: "my-palette", instruction: "Test." });
    const runContext = makeRunContext();

    await composer.compose(stroke, runContext);

    expect(resolvePalette).toHaveBeenCalledWith("my-palette");
    expect(resolvePalette).toHaveBeenCalledTimes(1);
  });

  it("resolveKnowledge は stroke.name で呼ばれる", async () => {
    const palette = makeBasePalette();
    const resolveKnowledge = vi.fn().mockResolvedValue([]);
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      resolveKnowledge,
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ name: "specific-stroke", instruction: "Test." });
    const runContext = makeRunContext();

    await composer.compose(stroke, runContext);

    expect(resolveKnowledge).toHaveBeenCalledWith("specific-stroke");
  });

  it("resolveContract は stroke.name で呼ばれる", async () => {
    const palette = makeBasePalette();
    const resolveContract = vi.fn().mockResolvedValue([]);
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      resolveContract,
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ name: "contract-stroke", instruction: "Test." });
    const runContext = makeRunContext();

    await composer.compose(stroke, runContext);

    expect(resolveContract).toHaveBeenCalledWith("contract-stroke");
  });

  it("resolveKnowledge が未定義の場合、Knowledge ファセットは追加されない", async () => {
    const palette = makeBasePalette();
    const deps: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette),
      // resolveKnowledge is not provided
    };

    const composer = new PromptComposer(deps);
    const stroke = makeStroke({ instruction: "Only instruction." });
    const runContext = makeRunContext();

    const result = await composer.compose(stroke, runContext);

    // userPrompt には instruction のみ
    expect(result.userPrompt).toBe("Only instruction.");
  });

  it("異なる PromptComposer インスタンスの deps は互いに独立している", async () => {
    const palette1 = makeBasePalette("Persona 1");
    const palette2 = makeBasePalette("Persona 2");

    const deps1: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette1),
    };
    const deps2: PromptComposerDeps = {
      resolvePalette: vi.fn().mockResolvedValue(palette2),
    };

    const composer1 = new PromptComposer(deps1);
    const composer2 = new PromptComposer(deps2);

    const stroke = makeStroke({ instruction: "Test." });
    const runContext = makeRunContext();

    const result1 = await composer1.compose(stroke, runContext);
    const result2 = await composer2.compose(stroke, runContext);

    expect(result1.systemPrompt).toBe("Persona 1");
    expect(result2.systemPrompt).toBe("Persona 2");
    expect(deps1.resolvePalette).toHaveBeenCalledTimes(1);
    expect(deps2.resolvePalette).toHaveBeenCalledTimes(1);
  });
});
