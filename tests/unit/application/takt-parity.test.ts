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
  return { runner, mediumExecutor, eventBus };
}

const dryRunOptions: RunOptions = { dryRun: true };

// ---- セットアップ ----

beforeEach(() => {
  vi.clearAllMocks();
  mockFileExists.mockResolvedValue(false);
  mockReadTextFile.mockResolvedValue("");
});

// ==== 1. initial_stroke テスト ====

describe("initial_stroke", () => {
  it("指定されたstrokeから実行を開始する", async () => {
    const { runner, eventBus } = createRunner();
    const strokeNames: string[] = [];

    // イベントを監視して実行されたstroke名を記録
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
    const { runner, eventBus } = createRunner();
    const strokeNames: string[] = [];

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
  it("readonly → permissionMode が 'readonly' で MediumExecutor に渡される", async () => {
    const { runner, mediumExecutor } = createRunner();

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

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].permissionMode).toBe("readonly");
  });

  it("full → permissionMode が 'full' で MediumExecutor に渡される", async () => {
    const { runner, mediumExecutor } = createRunner();

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

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].permissionMode).toBe("full");
  });

  it("permission_mode未指定 + allow_edit: true → allowEdit が true で渡される", async () => {
    const { runner, mediumExecutor } = createRunner();

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

    expect(mediumExecutor.calls.length).toBe(1);
    expect(mediumExecutor.calls[0].allowEdit).toBe(true);
  });
});

// ==== 3. quality_gates テスト ====

describe("quality_gates", () => {
  it("Canvas上の値がチェックされる（成功と失敗）", async () => {
    const { runner } = createRunner();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
    const { runner, mediumExecutor } = createRunner();

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
    expect(mediumExecutor.calls.length).toBeGreaterThanOrEqual(2);
    const stroke2Prompt = mediumExecutor.calls[1].prompt;
    expect(stroke2Prompt).toContain("ADDITIONAL CONTEXT: Please also consider edge cases.");
    expect(stroke2Prompt).toContain("Second task");
  });
});
