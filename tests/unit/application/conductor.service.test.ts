/**
 * Conductor Service 単体テスト
 *
 * テスト戦略:
 * - runSubprocess をモックして AI 呼び出しをシミュレート
 * - fileExists / readTextFile をモックしてパレット読み込みをシミュレート
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- モック設定 ----
const mockRunSubprocess = vi.hoisted(() => vi.fn());
vi.mock("../../../src/infrastructure/process/subprocess.js", () => ({
  runSubprocess: mockRunSubprocess,
}));

const mockFileExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  fileExists: mockFileExists,
  readTextFile: mockReadTextFile,
}));

const mockGetBuiltinPalettePath = vi.hoisted(() => vi.fn());
vi.mock("../../../src/builtin/index.js", () => ({
  getBuiltinPalettePath: mockGetBuiltinPalettePath,
}));

import { runConductor } from "../../../src/application/services/conductor.service.js";
import type {
  ConductorConfig,
  ConductorResult,
} from "../../../src/application/services/conductor.service.js";
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
      { condition: "needs_fix", next: "fix-stroke" },
    ],
    ...overrides,
  };
}

// ── テスト ──────────────────────────────────────────────────────────

describe("runConductor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // デフォルト: パレットファイルは存在しない（ビルトインフォールバック）
    mockFileExists.mockResolvedValue(false);
    mockGetBuiltinPalettePath.mockReturnValue("/builtin/palettes/conductor.yaml");
  });

  it("approved ステータス → 対応する rule の next が返る", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "実装は完了しています。品質も十分です。\n[STATUS: approved]",
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
  });

  it("needs_fix ステータス → 対応する rule の next が返る", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "いくつかの問題があります。\n[STATUS: needs_fix]",
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
    expect(result.nextStroke).toBe("fix-stroke");
    expect(result.rawResponse).toContain("[STATUS: needs_fix]");
  });

  it("ステータスタグなし → デフォルト approved", async () => {
    mockRunSubprocess.mockResolvedValue({
      stdout: "特に問題はありませんでした。",
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
  });

  it("rules に一致する condition がない → nextStroke = null", async () => {
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
});
