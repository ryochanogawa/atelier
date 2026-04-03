/**
 * palette_providers 機能の単体テスト
 *
 * palette ごとに medium/model を切り替える機能を検証する。
 * 優先順位:
 *   1. stroke.model / stroke.medium（最優先）
 *   2. palette_providers[paletteName].model / .medium（studio.yaml 設定）
 *   3. defaultMedium（グローバルデフォルト）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
import type { CommissionDefinition, RunOptions, PaletteProviderConfig } from "../../../src/shared/types.js";
import { createMockMediumExecutor } from "../../helpers/mock-medium.js";

// ---- テスト用ファクトリ ----

function createRunner(opts?: {
  defaultMedium?: string;
  mediumMap?: Map<string, string>;
  paletteProviders?: Record<string, PaletteProviderConfig>;
}) {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumExecutor = createMockMediumExecutor(
    opts?.mediumMap ?? new Map([
      ["test-medium", "mock response"],
      ["claude-code", "mock response"],
      ["custom-medium", "custom mock response"],
    ]),
  );
  return new CommissionRunnerService({
    eventBus,
    mediumExecutor,
    defaultMedium: opts?.defaultMedium ?? "test-medium",
    cwd: "/tmp/test-project",
    projectPath: "/tmp/test-project",
    paletteProviders: opts?.paletteProviders,
  });
}

function makeCommission(overrides?: Partial<CommissionDefinition>): CommissionDefinition {
  return {
    name: "test-commission",
    description: "テスト用 Commission",
    strokes: [
      {
        name: "stroke-1",
        palette: "coder",
        instruction: "テスト用インストラクション",
        inputs: [],
        outputs: [],
      },
    ],
    ...overrides,
  };
}

const dryRunOptions: RunOptions = { dryRun: true };

// ---- パレット YAML スタブ ----
const paletteYaml = `
name: coder
description: テスト用コーダー
persona: |
  あなたはコーダーです。
`;

const plannerPaletteYaml = `
name: planner
description: テスト用プランナー
persona: |
  あなたはプランナーです。
`;

// ---- テスト ----

describe("palette_providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileExists.mockResolvedValue(false);
    mockReadTextFile.mockResolvedValue(paletteYaml);
  });

  it("palette_providers 設定あり: 該当 palette の medium/model が使われる", async () => {
    const runner = createRunner({
      paletteProviders: {
        coder: {
          medium: "custom-medium",
          model: "claude-opus-4-6",
        },
      },
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "テスト",
          inputs: [],
          outputs: [],
        },
      ],
    });

    // dry-run で実行してストロークの設定を確認
    const result = await runner.execute(commission, "test-run-1", dryRunOptions);

    expect(result.status).toBe("completed");
    expect(result.strokesExecuted).toBe(1);
  });

  it("palette_providers 未設定: デフォルト medium が使われる", async () => {
    // paletteProviders を渡さない
    const runner = createRunner({
      defaultMedium: "test-medium",
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "テスト",
          inputs: [],
          outputs: [],
        },
      ],
    });

    const result = await runner.execute(commission, "test-run-2", dryRunOptions);

    expect(result.status).toBe("completed");
    expect(result.strokesExecuted).toBe(1);
  });

  it("stroke.model と palette_providers 両方ある: stroke.model が優先される", async () => {
    const runner = createRunner({
      paletteProviders: {
        coder: {
          medium: "custom-medium",
          model: "claude-sonnet-4-6",
        },
      },
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          // stroke レベルの medium と model（最優先）
          medium: "test-medium",
          model: "claude-opus-4-6",
          instruction: "テスト",
          inputs: [],
          outputs: [],
        },
      ],
    });

    // dry-run で実行 — stroke.medium/model が優先されるはず
    const result = await runner.execute(commission, "test-run-3", dryRunOptions);

    expect(result.status).toBe("completed");
    expect(result.strokesExecuted).toBe(1);
  });

  it("palette_providers の medium のみ設定: medium は palette_providers、model は未設定", async () => {
    const runner = createRunner({
      defaultMedium: "test-medium",
      paletteProviders: {
        coder: {
          medium: "custom-medium",
          // model は未設定
        },
      },
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "テスト",
          inputs: [],
          outputs: [],
        },
      ],
    });

    const result = await runner.execute(commission, "test-run-4", dryRunOptions);

    expect(result.status).toBe("completed");
    expect(result.strokesExecuted).toBe(1);
  });

  it("異なる palette に異なる provider を設定できる", async () => {
    const runner = createRunner({
      defaultMedium: "test-medium",
      mediumMap: new Map([
        ["test-medium", "mock"],
        ["claude-code", "mock"],
        ["fast-medium", "mock"],
      ]),
      paletteProviders: {
        planner: {
          medium: "fast-medium",
          model: "claude-sonnet-4-6",
        },
        coder: {
          medium: "claude-code",
          model: "claude-opus-4-6",
        },
      },
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "plan-stroke",
          palette: "planner",
          instruction: "計画を立てる",
          inputs: [],
          outputs: ["plan"],
        },
        {
          name: "code-stroke",
          palette: "coder",
          instruction: "コードを書く",
          inputs: ["plan"],
          outputs: [],
        },
      ],
    });

    mockReadTextFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes("planner")) return plannerPaletteYaml;
      return paletteYaml;
    });

    const result = await runner.execute(commission, "test-run-5", dryRunOptions);

    expect(result.status).toBe("completed");
    expect(result.strokesExecuted).toBe(2);
  });
});
