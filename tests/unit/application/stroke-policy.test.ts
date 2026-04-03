/**
 * Stroke-level Policy テスト
 *
 * stroke.policy によるポリシー指定の優先順位を検証:
 * 1. stroke.policy が指定 → そのpolicyがプロンプトに注入される
 * 2. stroke.policy が未指定 → Paletteのpoliciesが使われる（従来通り）
 * 3. stroke.policy と Palette.policies の両方がある → stroke.policy が優先
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義 ----
const mockFileExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  fileExists: mockFileExists,
  readTextFile: mockReadTextFile,
}));

import { CommissionRunnerService } from "../../../src/application/services/commission-runner.service.js";
import { TypedEventEmitter } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { AtelierEvents } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { CommissionDefinition, RunOptions } from "../../../src/shared/types.js";
import { createMockMediumExecutor } from "../../helpers/mock-medium.js";

// ---- ヘルパー ----

function createRunner() {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumExecutor = createMockMediumExecutor(
    new Map([["test-medium", "mock response"]]),
  );
  return new CommissionRunnerService({
    eventBus,
    mediumExecutor,
    defaultMedium: "test-medium",
    cwd: "/tmp/test-project",
    projectPath: "/tmp/test-project",
  });
}

const dryRunOptions: RunOptions = { dryRun: true };

function stubPaletteYaml(persona: string, policies?: string[]): string {
  const lines = [`name: test-palette`, `persona: "${persona}"`];
  if (policies && policies.length > 0) {
    lines.push(`policies:`);
    for (const p of policies) {
      lines.push(`  - ${p}`);
    }
  }
  return lines.join("\n");
}

function stubPolicyYaml(name: string, ruleName: string, ruleContent: string): string {
  return [
    `name: ${name}`,
    `rules:`,
    `  - name: "${ruleName}"`,
    `    content: "${ruleContent}"`,
  ].join("\n");
}

// ---- セットアップ ----

beforeEach(() => {
  vi.clearAllMocks();
  mockFileExists.mockResolvedValue(false);
  mockReadTextFile.mockResolvedValue("");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// stroke.policy テスト
// ============================================================

describe("stroke-level policy", () => {
  it("stroke.policy が指定されている場合、そのpolicyがプロンプトに注入される", async () => {
    const runner = createRunner();

    // Palette: policiesなし
    const paletteYaml = stubPaletteYaml("You are a coder.");
    // stroke固有のpolicy
    const strokePolicyYaml = stubPolicyYaml("stroke-policy", "stroke-rule", "Always use TypeScript.");

    mockFileExists.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return true;
      if (filePath.includes("policies") && filePath.includes("xmobile-policy.yaml")) return true;
      return false;
    });

    const readPolicies: string[] = [];
    mockReadTextFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return paletteYaml;
      if (filePath.includes("policies") && filePath.includes("xmobile-policy.yaml")) {
        readPolicies.push("xmobile-policy");
        return strokePolicyYaml;
      }
      return "";
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "implement",
          palette: "coder",
          instruction: "Implement the feature.",
          policy: "xmobile-policy",
        },
      ],
    };

    const runOptions: RunOptions = { dryRun: false };
    const result = await runner.execute(commission, "run-001", runOptions);

    expect(result.status).toBe("completed");
    expect(result.errors).toHaveLength(0);
    // stroke固有のpolicyが読み込まれたことを確認
    expect(readPolicies).toContain("xmobile-policy");
  });

  it("stroke.policy が未指定の場合、Paletteのpoliciesが使われる", async () => {
    const runner = createRunner();

    // Palette: policiesあり
    const paletteYaml = stubPaletteYaml("You are a coder.", ["palette-policy"]);
    const palettePolicyYaml = stubPolicyYaml("palette-policy", "palette-rule", "Use clean code.");

    const readPolicies: string[] = [];
    mockFileExists.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return true;
      if (filePath.includes("policies") && filePath.includes("palette-policy.yaml")) return true;
      return false;
    });

    mockReadTextFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return paletteYaml;
      if (filePath.includes("policies") && filePath.includes("palette-policy.yaml")) {
        readPolicies.push("palette-policy");
        return palettePolicyYaml;
      }
      return "";
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "implement",
          palette: "coder",
          instruction: "Implement the feature.",
          // policy 未指定 → Palette のポリシーがフォールバック
        },
      ],
    };

    const runOptions: RunOptions = { dryRun: false };
    const result = await runner.execute(commission, "run-001", runOptions);
    expect(result.status).toBe("completed");
    expect(result.errors).toHaveLength(0);
    // Paletteのpolicyが読み込まれたことを確認
    expect(readPolicies).toContain("palette-policy");
  });

  it("stroke.policy と Palette.policies の両方がある場合、stroke.policy が優先される", async () => {
    const runner = createRunner();

    // Palette: policiesあり
    const paletteYaml = stubPaletteYaml("You are a coder.", ["palette-policy"]);
    const palettePolicyYaml = stubPolicyYaml("palette-policy", "palette-rule", "Use clean code.");
    const strokePolicyYaml = stubPolicyYaml("stroke-policy", "stroke-rule", "Always use TypeScript.");

    // Track which policy files are read
    const readPolicies: string[] = [];

    mockFileExists.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return true;
      if (filePath.includes("policies") && filePath.includes("stroke-policy.yaml")) return true;
      if (filePath.includes("policies") && filePath.includes("palette-policy.yaml")) return true;
      return false;
    });

    mockReadTextFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes("palettes") && filePath.includes("coder.yaml")) return paletteYaml;
      if (filePath.includes("policies") && filePath.includes("stroke-policy.yaml")) {
        readPolicies.push("stroke-policy");
        return strokePolicyYaml;
      }
      if (filePath.includes("policies") && filePath.includes("palette-policy.yaml")) {
        readPolicies.push("palette-policy");
        return palettePolicyYaml;
      }
      return "";
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "implement",
          palette: "coder",
          instruction: "Implement the feature.",
          policy: "stroke-policy", // stroke固有のpolicy → こちらが優先
        },
      ],
    };

    const runOptions: RunOptions = { dryRun: false };
    const result = await runner.execute(commission, "run-001", runOptions);

    expect(result.status).toBe("completed");
    expect(result.errors).toHaveLength(0);

    // stroke-policy が読み込まれ、palette-policy は読み込まれないこと
    expect(readPolicies).toContain("stroke-policy");
    expect(readPolicies).not.toContain("palette-policy");
  });
});
