import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MediumRequest } from "../../../src/adapters/medium/types.js";

// execa モック
vi.mock("execa", () => {
  const execaMock = vi.fn();
  return { execa: execaMock };
});

// subprocess モック（executeWithReadTools で使用）
vi.mock("../../../src/infrastructure/process/subprocess.js", () => ({
  runSubprocess: vi.fn(),
}));

// fs モック（executeWithReadTools で使用）
vi.mock("node:fs/promises", () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/atelier-test"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

import { execa } from "execa";
import { ClaudeCodeAdapter } from "../../../src/adapters/medium/claude-code.adapter.js";

const mockExeca = vi.mocked(execa);

function makeRequest(overrides: Partial<MediumRequest> = {}): MediumRequest {
  return {
    prompt: "Hello, Claude",
    workingDirectory: "/tmp",
    allowEdit: false,
    timeoutMs: 30_000,
    ...overrides,
  };
}

function makeExecaResult(overrides: Partial<{ stdout: string; stderr: string; exitCode: number }> = {}) {
  const result = {
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
    exitCode: overrides.exitCode ?? 0,
    kill: vi.fn(),
  };
  // ResultPromise として扱えるように then/catch/finally を付与
  const promise = Object.assign(Promise.resolve(result), result);
  return promise;
}

describe("ClaudeCodeAdapter", () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    vi.clearAllMocks();
  });

  describe("name", () => {
    it('"claude-code" という名前を持つ', () => {
      expect(adapter.name).toBe("claude-code");
    });
  });

  describe("buildArgs / execute", () => {
    it("コマンド引数に --print が含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "result text" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest());

      expect(mockExeca).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--print"]),
        expect.any(Object),
      );
    });

    it("プロンプトが引数の末尾に含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ prompt: "test prompt" }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args[args.length - 1]).toBe("test prompt");
    });

    it("allowEdit: false の場合 --dangerously-skip-permissions 引数を含まない", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ allowEdit: false }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain("--dangerously-skip-permissions");
    });

    it("systemPrompt が指定された場合 --system-prompt 引数が含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ systemPrompt: "You are helpful." }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--system-prompt");
      expect(args).toContain("You are helpful.");
    });

    it("extraArgs が指定された場合に引数に含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ extraArgs: ["--model", "claude-3-5-sonnet"] }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--model");
      expect(args).toContain("claude-3-5-sonnet");
    });
  });

  describe("parseResponse - JSONレスポンス", () => {
    it("result フィールドを持つ JSON をパースして content に設定する", async () => {
      const jsonOutput = JSON.stringify({ result: "parsed result text" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("parsed result text");
      expect(response.rawStdout).toBe(jsonOutput);
    });

    it("content フィールドを持つ JSON をパースして content に設定する", async () => {
      const jsonOutput = JSON.stringify({ content: "content field text" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("content field text");
    });

    it("result と content が両方存在する場合は result を優先する", async () => {
      const jsonOutput = JSON.stringify({ result: "result wins", content: "content loses" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("result wins");
    });

    it("result/content が文字列でない JSON の場合は stdout をそのまま content に設定する", async () => {
      const jsonOutput = JSON.stringify({ result: 42 });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe(jsonOutput);
    });
  });

  describe("parseResponse - plain text フォールバック", () => {
    it("JSON でないレスポンスはそのまま content に設定する", async () => {
      const plainText = "This is plain text output.";
      mockExeca.mockReturnValue(makeExecaResult({ stdout: plainText }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe(plainText);
      expect(response.rawStdout).toBe(plainText);
    });

    it("空のレスポンスは空文字列を content に設定する", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("");
    });
  });

  describe("parseResponse - メタ情報", () => {
    it("exitCode が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", exitCode: 1 }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.exitCode).toBe(1);
    });

    it("rawStderr が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", stderr: "warning msg" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.rawStderr).toBe("warning msg");
    });

    it("durationMs が数値として設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(typeof response.durationMs).toBe("number");
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("checkAvailability", () => {
    it("claude --version が成功した場合 available: true を返す", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "1.2.3" }) as ReturnType<typeof execa>);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.version).toBe("1.2.3");
    });

    it("claude --version が失敗した場合 available: false を返す", async () => {
      mockExeca.mockRejectedValue(new Error("command not found: claude") as never);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toBe("command not found: claude");
    });
  });
});
