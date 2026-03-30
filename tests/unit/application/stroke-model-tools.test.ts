/**
 * Stroke model / allowed_tools 単体テスト
 *
 * stroke.model と stroke.allowed_tools が Medium コマンド引数に
 * 正しく反映されることを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義（vitest ホイスティング対策）----
const mockRunSubprocess = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockMkdtemp = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
vi.mock("../../../src/infrastructure/process/subprocess.js", () => ({
  runSubprocess: mockRunSubprocess,
}));

vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  fileExists: mockFileExists,
  readTextFile: mockReadTextFile,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdtemp: mockMkdtemp,
    writeFile: mockWriteFile,
    rm: mockRm,
  },
}));

import { CommissionRunnerService } from "../../../src/application/services/commission-runner.service.js";
import { TypedEventEmitter } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { AtelierEvents } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { CommissionDefinition, RunOptions } from "../../../src/shared/types.js";
import { createMockMediumRegistry } from "../../helpers/mock-medium.js";

// ---- テスト用ファクトリ ----

function createRunner() {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumRegistry = createMockMediumRegistry(
    new Map([["test-medium", "mock response"]]),
  );
  return new CommissionRunnerService({
    eventBus,
    mediumRegistry,
    defaultMedium: "test-medium",
    cwd: "/tmp/test-project",
    projectPath: "/tmp/test-project",
  });
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

  mockRunSubprocess.mockResolvedValue({
    stdout: "mock output",
    stderr: "",
    exitCode: 0,
    duration: 100,
  });

  mockMkdtemp.mockResolvedValue("/tmp/atelier-test-123");
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Stroke model / allowed_tools テスト
// ============================================================

describe("Stroke model / allowed_tools", () => {
  /** runSubprocess に渡されたシェルコマンドを取得するヘルパー */
  function getShellCommand(): string {
    const call = mockRunSubprocess.mock.calls[0];
    // runSubprocess("bash", ["-c", shellCmd], ...)
    return call[1][1];
  }

  it("stroke.model が指定されている場合、コマンド引数に --model が含まれる", async () => {
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

    const runner = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    const cmd = getShellCommand();
    expect(cmd).toContain("--model");
    expect(cmd).toContain("claude-sonnet-4-6");
  });

  it("stroke.model が未指定の場合、--model 引数なし", async () => {
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

    const runner = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    const cmd = getShellCommand();
    expect(cmd).not.toContain("--model");
  });

  it("stroke.allowed_tools が指定されている場合、コマンド引数に --allowedTools が含まれる", async () => {
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

    const runner = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    const cmd = getShellCommand();
    expect(cmd).toContain("--allowedTools");
    expect(cmd).toContain("Read");
    expect(cmd).toContain("Glob");
    expect(cmd).toContain("Grep");
  });

  it("stroke.allowed_tools が未指定の場合、--allowedTools 引数なし（allow_edit も false）", async () => {
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

    const runner = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    const cmd = getShellCommand();
    expect(cmd).not.toContain("--allowedTools");
  });

  it("model と allowed_tools の両方が指定されている場合、両方の引数が含まれる", async () => {
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

    const runner = createRunner();
    await runner.execute(commission, "run-1", defaultRunOptions);

    const cmd = getShellCommand();
    expect(cmd).toContain("--model");
    expect(cmd).toContain("claude-opus-4-6");
    expect(cmd).toContain("--allowedTools");
    expect(cmd).toContain("Read");
    expect(cmd).toContain("Glob");
    expect(cmd).toContain("Grep");
    expect(cmd).toContain("Bash");
  });
});
