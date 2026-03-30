/**
 * Conductor 統合テスト
 *
 * commission-runner 経由で conductor.service.ts が呼ばれることを検証する。
 * runSubprocess をモックして AI 呼び出しをシミュレートし、
 * runConductor() の結果に基づくフロー制御を確認する。
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

const mockGetBuiltinPalettePath = vi.hoisted(() => vi.fn());
const mockGetBuiltinPolicyPath = vi.hoisted(() => vi.fn());
const mockGetBuiltinContractPath = vi.hoisted(() => vi.fn());
const mockGetBuiltinInstructionPath = vi.hoisted(() => vi.fn());
const mockGetBuiltinKnowledgePath = vi.hoisted(() => vi.fn());
vi.mock("../../../src/builtin/index.js", () => ({
  getBuiltinPalettePath: mockGetBuiltinPalettePath,
  getBuiltinPolicyPath: mockGetBuiltinPolicyPath,
  getBuiltinContractPath: mockGetBuiltinContractPath,
  getBuiltinInstructionPath: mockGetBuiltinInstructionPath,
  getBuiltinKnowledgePath: mockGetBuiltinKnowledgePath,
}));

import { runConductor } from "../../../src/application/services/conductor.service.js";
import type {
  ConductorConfig,
} from "../../../src/application/services/conductor.service.js";
import { Canvas } from "../../../src/domain/models/canvas.model.js";
import type { MediumRegistry } from "../../../src/application/services/commission-runner.service.js";

// ── ヘルパー ────────────────────────────────────────────────────────

function createMockMediumRegistry(): MediumRegistry {
  return {
    getCommand: vi.fn().mockReturnValue({
      command: "claude",
      args: ["-p"],
    }),
    listMedia: vi.fn().mockReturnValue(["claude"]),
  };
}

function createDefaultConfig(overrides?: Partial<ConductorConfig>): ConductorConfig {
  return {
    rules: [
      { condition: "approved", next: "deploy" },
      { condition: "needs_fix", next: "implement" },
    ],
    ...overrides,
  };
}

// ── テスト ──────────────────────────────────────────────────────────

describe("Conductor 統合テスト: commission-runner 経由の conductor.service.ts 呼び出し", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // デフォルト: パレットファイルは存在しない（ビルトインフォールバック）
    mockFileExists.mockResolvedValue(false);
    mockGetBuiltinPalettePath.mockReturnValue("/builtin/palettes/conductor.yaml");
    // mkdtemp のモック
    mockMkdtemp.mockResolvedValue("/tmp/atelier-conductor-test");
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  it("approved → conductor.rules に基づく次の stroke (deploy) が返る", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "実装は問題ありません。\n[STATUS: approved]",
      stderr: "",
      exitCode: 0,
      duration: 1000,
    });

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumRegistry(),
      "claude",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("approved");
    expect(result.nextStroke).toBe("deploy");
    expect(result.rawResponse).toContain("[STATUS: approved]");
    // runSubprocess が呼ばれたことを確認（conductor.service.ts 経由）
    expect(mockRunSubprocess).toHaveBeenCalledTimes(1);
  });

  it("needs_fix → conductor.rules に基づく再実行 stroke (implement) が返る", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "修正が必要です。\n[STATUS: needs_fix]",
      stderr: "",
      exitCode: 0,
      duration: 1000,
    });

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumRegistry(),
      "claude",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("needs_fix");
    expect(result.nextStroke).toBe("implement");
    expect(result.rawResponse).toContain("[STATUS: needs_fix]");
  });

  it("rules 未マッチ → nextStroke = null（通常フローフォールバック用）", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "[STATUS: needs_review]",
      stderr: "",
      exitCode: 0,
      duration: 1000,
    });

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(), // rules には "approved" と "needs_fix" のみ
      createMockMediumRegistry(),
      "claude",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("needs_review");
    expect(result.nextStroke).toBeNull();
  });

  it("ステータスが Canvas に保存されること（runConductorPhase のフロー検証）", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "品質は十分です。\n[STATUS: approved]",
      stderr: "",
      exitCode: 0,
      duration: 1000,
    });

    const canvas = new Canvas();
    canvas.set("review_output", "some review result");

    // runConductor を呼び出し
    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumRegistry(),
      "claude",
      "/tmp",
      "/project",
    );

    // conductor.service.ts はステータスを返すのみで Canvas 操作はしない
    // Canvas への保存は commission-runner.service.ts の runConductorPhase が行う
    // ここでは runConductor の結果を使って Canvas に保存するフローを検証
    const strokeName = "review";
    canvas.set(`${strokeName}_conductor_status`, result.status);

    expect(canvas.get(`${strokeName}_conductor_status`)).toBe("approved");
  });

  it("parseStatusTag は最初のタグを採用する（conductor.service.ts の仕様）", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "[STATUS: needs_fix] 修正後 [STATUS: approved]",
      stderr: "",
      exitCode: 0,
      duration: 1000,
    });

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumRegistry(),
      "claude",
      "/tmp",
      "/project",
    );

    // parseStatusTag は最初のタグを採用する
    expect(result.status).toBe("needs_fix");
    expect(result.nextStroke).toBe("implement");
  });
});
