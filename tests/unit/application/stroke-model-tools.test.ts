/**
 * Stroke model / allowed_tools 単体テスト
 *
 * stroke.model と stroke.allowed_tools が Medium コマンド引数に
 * 正しく反映されることを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義（vitest ホイスティング対策）----
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

// ---- テスト用ファクトリ ----

function createRunner() {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumExecutor = createMockMediumExecutor(
    new Map([["test-medium", "mock response"]]),
  );
  const runner = new CommissionRunnerService({
    eventBus,
    mediumExecutor,
    defaultMedium: "test-medium",
    cwd: "/tmp/test-project",
    projectPath: "/tmp/test-project",
  });
  return { runner, mediumExecutor };
}

const defaultRunOptions: RunOptions = { dryRun: false };

// ---- パレット YAML スタブ ----
function stubPaletteYaml(persona: string): string {
  return [`name: test-palette`, `persona: "${persona}"`].join("\n");
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
// Stroke model / allowed_tools テスト
// ============================================================

describe("Stroke model / allowed_tools", () => {
  it("stroke.model が指定されている場合、MediumExecutor に model が渡される", async () => {
    // パレットを返すようモック
    mockFileExists.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette")),
    );
    mockReadTextFile.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette") ? stubPaletteYaml("テスト persona") : ""),
    );

    const commission: CommissionDefinition = {
      name: "test-commission",
      description: "テスト",
      strokes: [
        {
          name: "plan",
          palette: "planner",
          instruction: "計画を立てて",
          model: "claude-sonnet-4-6",
        },
      ],
    };

    const { runner, mediumExecutor } = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].model).toBe("claude-sonnet-4-6");
  });

  it("stroke.model が未指定の場合、model は undefined", async () => {
    mockFileExists.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette")),
    );
    mockReadTextFile.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette") ? stubPaletteYaml("テスト persona") : ""),
    );

    const commission: CommissionDefinition = {
      name: "test-commission",
      description: "テスト",
      strokes: [
        {
          name: "plan",
          palette: "planner",
          instruction: "計画を立てて",
          // model 未指定
        },
      ],
    };

    const { runner, mediumExecutor } = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].model).toBeUndefined();
  });

  it("stroke.allowed_tools が指定されている場合、MediumExecutor に allowedTools が渡される", async () => {
    mockFileExists.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette")),
    );
    mockReadTextFile.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette") ? stubPaletteYaml("テスト persona") : ""),
    );

    const commission: CommissionDefinition = {
      name: "test-commission",
      description: "テスト",
      strokes: [
        {
          name: "plan",
          palette: "planner",
          instruction: "計画を立てて",
          allowed_tools: ["Read", "Glob", "Grep"],
        },
      ],
    };

    const { runner, mediumExecutor } = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].allowedTools).toEqual(["Read", "Glob", "Grep"]);
  });

  it("stroke.allowed_tools が未指定の場合、allowedTools は undefined（allow_edit も false）", async () => {
    mockFileExists.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette")),
    );
    mockReadTextFile.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette") ? stubPaletteYaml("テスト persona") : ""),
    );

    const commission: CommissionDefinition = {
      name: "test-commission",
      description: "テスト",
      strokes: [
        {
          name: "plan",
          palette: "planner",
          instruction: "計画を立てて",
          // allowed_tools 未指定, allow_edit 未指定（デフォルト false）
        },
      ],
    };

    const { runner, mediumExecutor } = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].allowedTools).toBeUndefined();
  });

  it("model と allowed_tools の両方が指定されている場合、両方が MediumExecutor に渡される", async () => {
    mockFileExists.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette")),
    );
    mockReadTextFile.mockImplementation((p: string) =>
      Promise.resolve(p.includes("palette") ? stubPaletteYaml("テスト persona") : ""),
    );

    const commission: CommissionDefinition = {
      name: "test-commission",
      description: "テスト",
      strokes: [
        {
          name: "implement",
          palette: "coder",
          instruction: "実装して",
          model: "claude-opus-4-6",
          allowed_tools: ["Read", "Glob", "Grep", "Bash"],
        },
      ],
    };

    const { runner, mediumExecutor } = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].model).toBe("claude-opus-4-6");
    expect(mediumExecutor.calls[0].allowedTools).toEqual(["Read", "Glob", "Grep", "Bash"]);
  });
});
