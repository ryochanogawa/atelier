/**
 * テンプレート変数（iteration / stroke_iteration / max_iterations）テスト
 *
 * CommissionRunnerService のプロンプト組み立て時に、
 * Canvas 変数に加えてランタイム変数が展開されることを検証する。
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
// テンプレート変数テスト
// ============================================================

describe("テンプレート変数 {{iteration}}", () => {
  it("{{iteration}} が stroke 実行回数で展開される", async () => {
    const { runner, mediumExecutor } = createRunner();

    const commission: CommissionDefinition = {
      name: "iter-test",
      description: "iteration テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          // 改行を含めてインライン判定させる（resolveInstruction のファイル参照判定回避）
          instruction: "これは全体の {{iteration}} 回目の実行です。\nテンプレート変数の展開テストです。",
          inputs: [],
          outputs: [],
        },
        {
          name: "stroke-2",
          palette: "coder",
          instruction: "これは全体の {{iteration}} 回目の実行です。\n2番目のストロークです。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-iter", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBeGreaterThanOrEqual(2);
    // stroke-1 は全体の 1 回目
    expect(mediumExecutor.calls[0].prompt).toContain("これは全体の 1 回目の実行です");
    // stroke-2 は全体の 2 回目
    expect(mediumExecutor.calls[1].prompt).toContain("これは全体の 2 回目の実行です");
  });
});

describe("テンプレート変数 {{stroke_iteration}}", () => {
  it("{{stroke_iteration}} が現在 stroke の実行回数で展開される", async () => {
    const { runner, mediumExecutor } = createRunner();

    // 線形実行: 各 stroke は 1 回ずつ実行されるので stroke_iteration は常に 1
    const commission: CommissionDefinition = {
      name: "stroke-iter-test",
      description: "stroke_iteration テスト",
      strokes: [
        {
          name: "stroke-a",
          palette: "coder",
          instruction: "stroke_iteration={{stroke_iteration}} のテストです。\niteration={{iteration}} も展開されます。",
          inputs: [],
          outputs: [],
        },
        {
          name: "stroke-b",
          palette: "coder",
          instruction: "stroke_iteration={{stroke_iteration}} のテストです。\niteration={{iteration}} も展開されます。2番目。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-stroke-iter", defaultRunOptions);

    expect(mediumExecutor.calls.length).toBeGreaterThanOrEqual(2);
    // stroke-a: 初回実行なので stroke_iteration=1, iteration=1
    expect(mediumExecutor.calls[0].prompt).toContain("stroke_iteration=1");
    expect(mediumExecutor.calls[0].prompt).toContain("iteration=1");
    // stroke-b: 初回実行なので stroke_iteration=1, iteration=2
    expect(mediumExecutor.calls[1].prompt).toContain("stroke_iteration=1");
    expect(mediumExecutor.calls[1].prompt).toContain("iteration=2");
  });
});

describe("Canvas 変数との共存", () => {
  it("{{iteration}} と {{canvas_key}} が同時に展開される", async () => {
    const { runner, mediumExecutor } = createRunner();

    const commission: CommissionDefinition = {
      name: "coexist-test",
      description: "Canvas 変数との共存テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          // 改行を含めてインライン判定させる
          instruction: "iteration={{iteration}} requirement={{requirement}}\nmax={{max_iterations}} のテンプレート共存テストです。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-coexist", {
      dryRun: false,
      initialCanvas: { requirement: "ユーザー認証機能" },
    });

    expect(mediumExecutor.calls.length).toBeGreaterThanOrEqual(1);
    // iteration はランタイム変数から展開
    expect(mediumExecutor.calls[0].prompt).toContain("iteration=1");
    // requirement は Canvas から展開
    expect(mediumExecutor.calls[0].prompt).toContain("requirement=ユーザー認証機能");
    // max_iterations は loop_monitor なしなので空文字で展開
    expect(mediumExecutor.calls[0].prompt).not.toContain("{{max_iterations}}");
    expect(mediumExecutor.calls[0].prompt).toContain("max=");
  });
});
