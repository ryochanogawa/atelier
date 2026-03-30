/**
 * TAKT Parity テスト
 *
 * TAKTにあってATELIERにない4つのstroke-level機能の検証:
 * 1. initial_stroke - Commission内のstroke開始位置指定
 * 2. permission_mode - readonly/edit/full の3段階権限
 * 3. quality_gates - stroke完了後の品質チェック
 * 4. appendix - transition発火時の次strokeへの追加テキスト注入
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義 ----
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

const dryRunOptions: RunOptions = { dryRun: true };

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
  mockMkdtemp.mockResolvedValue("/tmp/atelier-test");
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
});

// ==== 1. initial_stroke テスト ====

describe("initial_stroke", () => {
  it("指定されたstrokeから実行を開始する", async () => {
    const runner = createRunner();
    const strokeNames: string[] = [];

    // イベントを監視して実行されたstroke名を記録
    const eventBus = (runner as any).deps.eventBus;
    eventBus.on("stroke:start", (data: { strokeName: string }) => {
      strokeNames.push(data.strokeName);
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      initial_stroke: "stroke-2",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "First stroke",
        },
        {
          name: "stroke-2",
          palette: "coder",
          instruction: "Second stroke",
        },
        {
          name: "stroke-3",
          palette: "coder",
          instruction: "Third stroke",
        },
      ],
    };

    const result = await runner.execute(commission, "run-1", dryRunOptions);

    // stroke-2 から開始し、stroke-3 まで実行される（stroke-1 はスキップ）
    expect(strokeNames[0]).toBe("stroke-2");
    expect(strokeNames).not.toContain("stroke-1");
    expect(result.strokesExecuted).toBe(2);
  });

  it("initial_stroke未指定時は先頭から実行（後方互換）", async () => {
    const runner = createRunner();
    const strokeNames: string[] = [];

    const eventBus = (runner as any).deps.eventBus;
    eventBus.on("stroke:start", (data: { strokeName: string }) => {
      strokeNames.push(data.strokeName);
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "First stroke",
        },
        {
          name: "stroke-2",
          palette: "coder",
          instruction: "Second stroke",
        },
      ],
    };

    const result = await runner.execute(commission, "run-1", dryRunOptions);

    expect(strokeNames[0]).toBe("stroke-1");
    expect(result.strokesExecuted).toBe(2);
  });
});

// ==== 2. permission_mode テスト ====

describe("permission_mode", () => {
  it("readonly → 読み取りツールのみ許可", async () => {
    const runner = createRunner();
    let capturedShellCmd = "";

    mockRunSubprocess.mockImplementation(async (_cmd: string, args: string[]) => {
      capturedShellCmd = args[1] ?? "";
      return { stdout: "output", stderr: "", exitCode: 0, duration: 100 };
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "readonly-stroke",
          palette: "coder",
          instruction: "Read only",
          permission_mode: "readonly",
        },
      ],
    };

    await runner.execute(commission, "run-1", { dryRun: false });

    // readonly モードでは Read, Glob, Grep のみ
    expect(capturedShellCmd).toContain("Read");
    expect(capturedShellCmd).toContain("Glob");
    expect(capturedShellCmd).toContain("Grep");
    expect(capturedShellCmd).not.toContain("Edit");
    expect(capturedShellCmd).not.toContain("Write");
    expect(capturedShellCmd).not.toContain("Bash");
  });

  it("full → 全ツール許可", async () => {
    const runner = createRunner();
    let capturedShellCmd = "";

    mockRunSubprocess.mockImplementation(async (_cmd: string, args: string[]) => {
      capturedShellCmd = args[1] ?? "";
      return { stdout: "output", stderr: "", exitCode: 0, duration: 100 };
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "full-stroke",
          palette: "coder",
          instruction: "Full access",
          permission_mode: "full",
        },
      ],
    };

    await runner.execute(commission, "run-1", { dryRun: false });

    // full モードでは全ツール許可
    expect(capturedShellCmd).toContain("Bash");
    expect(capturedShellCmd).toContain("Edit");
    expect(capturedShellCmd).toContain("Write");
  });

  it("permission_mode未指定 + allow_edit: true → 従来通り", async () => {
    const runner = createRunner();
    let capturedShellCmd = "";

    mockRunSubprocess.mockImplementation(async (_cmd: string, args: string[]) => {
      capturedShellCmd = args[1] ?? "";
      return { stdout: "output", stderr: "", exitCode: 0, duration: 100 };
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "edit-stroke",
          palette: "coder",
          instruction: "Edit mode",
          allow_edit: true,
        },
      ],
    };

    await runner.execute(commission, "run-1", { dryRun: false });

    // allow_edit: true の従来動作
    expect(capturedShellCmd).toContain("Edit");
    expect(capturedShellCmd).toContain("Write");
    expect(capturedShellCmd).toContain("Bash");
  });
});

// ==== 3. quality_gates テスト ====

describe("quality_gates", () => {
  it("Canvas上の値がチェックされる（成功と失敗）", async () => {
    const runner = createRunner();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Canvas に tests_pass=true, coverage=fail を設定
    mockRunSubprocess.mockResolvedValue({
      stdout: "mock output",
      stderr: "",
      exitCode: 0,
      duration: 100,
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "setup-stroke",
          palette: "coder",
          instruction: "Setup",
          outputs: ["tests_pass"],
        },
        {
          name: "gated-stroke",
          palette: "coder",
          instruction: "Gated",
          inputs: [],
          outputs: [],
          quality_gates: [
            { name: "tests-passing", condition: "tests_pass" },
            { name: "coverage-check", condition: "coverage" },
          ],
        },
      ],
    };

    await runner.execute(commission, "run-1", { dryRun: false });

    // tests_pass は Canvas に "mock output" があるので passed
    // coverage は Canvas に値がないので failed
    const errorCalls = consoleErrorSpy.mock.calls.map((c) => c[0]);
    const failedGate = errorCalls.find(
      (msg: string) => typeof msg === "string" && msg.includes("quality-gate") && msg.includes("FAILED"),
    );
    expect(failedGate).toBeDefined();
    expect(failedGate).toContain("coverage-check");

    consoleErrorSpy.mockRestore();
  });
});

// ==== 4. appendix テスト ====

describe("appendix", () => {
  it("transition発火時に次strokeのinstructionに追加テキストが注入される", async () => {
    const runner = createRunner();
    let lastPromptContent = "";

    mockRunSubprocess.mockImplementation(async (_cmd: string, args: string[]) => {
      return { stdout: "mock output", stderr: "", exitCode: 0, duration: 100 };
    });

    // writeFile をフックしてプロンプト内容をキャプチャ
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      lastPromptContent = content;
    });

    const commission: CommissionDefinition = {
      name: "test",
      description: "test",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "First task",
          outputs: ["result"],
          transitions: [
            {
              condition: "always",
              next: "stroke-2",
              appendix: "ADDITIONAL CONTEXT: Please also consider edge cases.",
            },
          ],
        },
        {
          name: "stroke-2",
          palette: "coder",
          instruction: "Second task",
          inputs: ["result"],
        },
      ],
    };

    await runner.execute(commission, "run-1", { dryRun: false });

    // stroke-2 のプロンプトに appendix が含まれている
    expect(lastPromptContent).toContain("ADDITIONAL CONTEXT: Please also consider edge cases.");
    expect(lastPromptContent).toContain("Second task");
  });
});
