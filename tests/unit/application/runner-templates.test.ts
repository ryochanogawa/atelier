/**
 * TAKT パリティ機能テスト（task 自動注入 / report_dir / output_contracts）
 *
 * CommissionRunnerService に追加した3つの TAKT パリティ機能を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義（vitest ホイスティング対策）----
const mockFileExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  fileExists: mockFileExists,
  readTextFile: mockReadTextFile,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
}));

import { CommissionRunnerService } from "../../../src/application/services/commission-runner.service.js";
import { TypedEventEmitter } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { AtelierEvents } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { CommissionDefinition, RunOptions } from "../../../src/shared/types.js";
import { createMockMediumExecutor } from "../../helpers/mock-medium.js";

// ---- テスト用ファクトリ ----

function createRunner(responseContent = "mock response") {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumExecutor = createMockMediumExecutor(
    new Map([["test-medium", responseContent]]),
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
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// 1. {{task}} 自動注入テスト
// ============================================================

describe("{{task}} 自動注入", () => {
  it("RunOptions.task が Canvas に自動セットされ instruction で展開される", async () => {
    const { runner, mediumExecutor } = createRunner();

    const commission: CommissionDefinition = {
      name: "task-inject-test",
      description: "task 自動注入テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "タスク: {{task}}\n実行してください。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    const options: RunOptions = {
      dryRun: false,
      task: "新機能を実装する",
    };

    await runner.execute(commission, "run-task", options);

    // MediumExecutor に渡されたプロンプトに {{task}} が展開された内容が含まれる
    const promptContent = mediumExecutor.calls.find((c) => c.prompt.includes("タスク:"));
    expect(promptContent).toBeDefined();
    expect(promptContent!.prompt).toContain("タスク: 新機能を実装する");
    expect(promptContent!.prompt).not.toContain("{{task}}");
  });

  it("RunOptions.task が未指定の場合は {{task}} が未展開のまま残る", async () => {
    const { runner, mediumExecutor } = createRunner();

    const commission: CommissionDefinition = {
      name: "task-no-inject-test",
      description: "task 未指定テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "タスク: {{task}}\n実行してください。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-no-task", defaultRunOptions);

    const promptContent = mediumExecutor.calls.find((c) => c.prompt.includes("タスク:"));
    expect(promptContent).toBeDefined();
    // task が未設定なので {{task}} は空文字に展開される
    expect(promptContent!.prompt).not.toContain("{{task}}");
    expect(promptContent!.prompt).toContain("タスク: \n");
  });
});

// ============================================================
// 2. {{report_dir}} テンプレート変数テスト
// ============================================================

describe("{{report_dir}} テンプレート変数", () => {
  it("{{report_dir}} が .atelier/reports/{runId}/ に展開される", async () => {
    const { runner, mediumExecutor } = createRunner();

    const commission: CommissionDefinition = {
      name: "report-dir-test",
      description: "report_dir テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "レポート出力先: {{report_dir}}\n確認してください。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-report-123", defaultRunOptions);

    const promptContent = mediumExecutor.calls.find((c) => c.prompt.includes("レポート出力先:"));
    expect(promptContent).toBeDefined();
    expect(promptContent!.prompt).toContain("レポート出力先: .atelier/reports/run-report-123/");
    expect(promptContent!.prompt).not.toContain("{{report_dir}}");
  });
});

// ============================================================
// 3. output_contracts 複数ファイル出力テスト
// ============================================================

describe("output_contracts 複数ファイル出力", () => {
  it("output_contracts 定義時にファイルパスが Canvas に保存される", async () => {
    const { runner, mediumExecutor } = createRunner("mock output");

    const writtenFiles: Array<{ path: string; content: string }> = [];
    mockWriteFile.mockImplementation(async (filePath: string, content: string) => {
      writtenFiles.push({ path: filePath, content });
    });

    const commission: CommissionDefinition = {
      name: "output-contracts-test",
      description: "output_contracts テスト",
      strokes: [
        {
          name: "planner",
          palette: "coder",
          instruction: "計画を作成してください。\n詳細に記述。",
          inputs: [],
          outputs: ["plan_result"],
          output_contracts: [
            { name: "plan.md" },
            { name: "summary.md", format: "簡易フォーマット" },
          ],
        },
        {
          name: "verifier",
          palette: "coder",
          // Canvas にセットされたファイルパスを参照する
          instruction: "計画ファイル: {{planner_report_plan_md}}\nサマリ: {{planner_report_summary_md}}\n確認してください。",
          inputs: ["plan_result"],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-oc-test", defaultRunOptions);

    // verifier stroke の prompt に展開されたファイルパスを検証
    const verifyCall = mediumExecutor.calls.find(
      (c) => c.prompt.includes("計画ファイル:") && c.prompt.includes("確認してください"),
    );
    expect(verifyCall).toBeDefined();
    expect(verifyCall!.prompt).toContain(
      "計画ファイル: .atelier/reports/run-oc-test/plan.md",
    );
    expect(verifyCall!.prompt).toContain(
      "サマリ: .atelier/reports/run-oc-test/summary.md",
    );
    expect(verifyCall!.prompt).not.toContain("{{planner_report_plan_md}}");
    expect(verifyCall!.prompt).not.toContain("{{planner_report_summary_md}}");

    // レポートファイルが report_dir 配下に書き出されている
    const reportFiles = writtenFiles.filter((f) =>
      f.path.includes(".atelier/reports/run-oc-test/"),
    );
    expect(reportFiles.length).toBe(2);
    // 各レポートファイルにはAI出力（mock output）が書かれている
    for (const rf of reportFiles) {
      expect(rf.content).toBe("mock output");
    }
  });

  it("output_contracts が未定義の場合は何も起きない", async () => {
    const { runner } = createRunner();

    const writtenFiles: Array<{ path: string; content: string }> = [];
    mockWriteFile.mockImplementation(async (filePath: string, content: string) => {
      writtenFiles.push({ path: filePath, content });
    });

    const commission: CommissionDefinition = {
      name: "no-output-contracts-test",
      description: "output_contracts 未定義テスト",
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "普通のストローク。\n何もしない。",
          inputs: [],
          outputs: [],
        },
      ],
    };

    await runner.execute(commission, "run-no-oc", defaultRunOptions);

    // report_dir 配下へのファイル書き出しは行われない
    const reportFiles = writtenFiles.filter((f) =>
      f.path.includes(".atelier/reports/"),
    );
    expect(reportFiles.length).toBe(0);
  });
});
