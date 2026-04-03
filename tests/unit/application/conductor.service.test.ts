/**
 * Conductor Service 単体テスト
 *
 * テスト戦略:
 * - runSubprocess をモックして AI 呼び出しをシミュレート
 * - fileExists / readTextFile をモックしてパレット読み込みをシミュレート
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- モック設定 ----
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
import type { MediumExecutor } from "../../../src/application/ports/medium-executor.port.js";

// ── ヘルパー ────────────────────────────────────────────────────────

function createMockMediumExecutor(aiResponse: string): MediumExecutor {
  return {
    async execute() {
      return {
        content: aiResponse,
        exitCode: 0,
        durationMs: 100,
        rawStdout: aiResponse,
        rawStderr: "",
      };
    },
    listMedia() {
      return ["claude-code"];
    },
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
    const aiResponse = "実装は完了しています。品質も十分です。\n[STATUS: approved]";

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumExecutor(aiResponse),
      "claude-code",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("approved");
    expect(result.nextStroke).toBe("deploy");
    expect(result.rawResponse).toContain("[STATUS: approved]");
  });

  it("needs_fix ステータス → 対応する rule の next が返る", async () => {
    const aiResponse = "いくつかの問題があります。\n[STATUS: needs_fix]";

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumExecutor(aiResponse),
      "claude-code",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("needs_fix");
    expect(result.nextStroke).toBe("fix-stroke");
    expect(result.rawResponse).toContain("[STATUS: needs_fix]");
  });

  it("ステータスタグなし → デフォルト approved", async () => {
    const aiResponse = "特に問題はありませんでした。";

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(),
      createMockMediumExecutor(aiResponse),
      "claude-code",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("approved");
    expect(result.nextStroke).toBe("deploy");
  });

  it("rules に一致する condition がない → nextStroke = null", async () => {
    const aiResponse = "[STATUS: needs_review]";

    const result = await runConductor(
      "stroke output here",
      createDefaultConfig(), // rules には "approved" と "needs_fix" のみ
      createMockMediumExecutor(aiResponse),
      "claude-code",
      "/tmp",
      "/project",
    );

    expect(result.status).toBe("needs_review");
    expect(result.nextStroke).toBeNull();
  });
});
