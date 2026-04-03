import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MediumExecuteRequest } from "../../../src/domain/ports/medium.port.js";

// execa モック
vi.mock("execa", () => {
  const execaMock = vi.fn();
  return { execa: execaMock };
});

import { execa } from "execa";
import { GeminiAdapter } from "../../../src/adapters/medium/gemini.adapter.js";

const mockExeca = vi.mocked(execa);

function makeRequest(overrides: Partial<MediumExecuteRequest> = {}): MediumExecuteRequest {
  return {
    prompt: "Explain this code",
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
  const promise = Object.assign(Promise.resolve(result), result);
  return promise;
}

describe("GeminiAdapter", () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    adapter = new GeminiAdapter();
    vi.clearAllMocks();
  });

  describe("name", () => {
    it('"gemini" という名前を持つ', () => {
      expect(adapter.name).toBe("gemini");
    });
  });

  describe("execute - コマンド引数構築", () => {
    it("gemini コマンドが呼ばれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest());

      expect(mockExeca).toHaveBeenCalledWith(
        "gemini",
        expect.any(Array),
        expect.any(Object),
      );
    });

    it("プロンプトは stdin (input) 経由で渡される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ prompt: "stdin prompt" }));

      const options = mockExeca.mock.calls[0][2] as Record<string, unknown>;
      expect(options.input).toBe("stdin prompt");
    });

    it("プロンプトはコマンド引数に含まれない", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ prompt: "secret prompt" }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain("secret prompt");
    });

    it("extraArgs が指定された場合に引数に含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ extraArgs: ["--model", "gemini-2.0-flash"] }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--model");
      expect(args).toContain("gemini-2.0-flash");
    });
  });

  describe("sandbox mode conditional", () => {
    it("allowEdit: false の場合 --sandbox フラグが含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ allowEdit: false }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--sandbox");
    });

    it("allowEdit: true の場合 --sandbox フラグが含まれない", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ allowEdit: true }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain("--sandbox");
    });
  });

  describe("parseResponse - JSONレスポンス", () => {
    it("response フィールドを持つ JSON をパースして content に設定する", async () => {
      const jsonOutput = JSON.stringify({ response: "gemini response text" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("gemini response text");
    });

    it("content フィールドを持つ JSON をパースして content に設定する", async () => {
      const jsonOutput = JSON.stringify({ content: "content field text" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("content field text");
    });

    it("response と content が両方存在する場合は response を優先する", async () => {
      const jsonOutput = JSON.stringify({ response: "response wins", content: "content loses" });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("response wins");
    });

    it("JSON パース成功時に structured フィールドが設定される", async () => {
      const parsed = { response: "text", extra: "data" };
      const jsonOutput = JSON.stringify(parsed);
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.structured).toEqual(parsed);
    });

    it("response/content が文字列でない JSON の場合は stdout トリム済みをそのまま content に設定する", async () => {
      const jsonOutput = JSON.stringify({ response: 99 });
      mockExeca.mockReturnValue(makeExecaResult({ stdout: jsonOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe(jsonOutput.trim());
    });
  });

  describe("parseResponse - plain text フォールバック", () => {
    it("JSON でないレスポンスはトリムして content に設定する", async () => {
      const plainText = "  plain text output  ";
      mockExeca.mockReturnValue(makeExecaResult({ stdout: plainText }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("plain text output");
      expect(response.structured).toBeUndefined();
    });

    it("rawStdout はトリム前の値が設定される", async () => {
      const rawOutput = "  raw output  ";
      mockExeca.mockReturnValue(makeExecaResult({ stdout: rawOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.rawStdout).toBe(rawOutput);
    });
  });

  describe("parseResponse - メタ情報", () => {
    it("exitCode が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", exitCode: 1 }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.exitCode).toBe(1);
    });

    it("rawStderr が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", stderr: "stderr msg" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.rawStderr).toBe("stderr msg");
    });

    it("durationMs が数値として設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(typeof response.durationMs).toBe("number");
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("checkAvailability", () => {
    it("gemini --version が成功した場合 available: true を返す", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "2.0.0" }) as ReturnType<typeof execa>);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.version).toBe("2.0.0");
    });

    it("gemini --version が失敗した場合 available: false を返す", async () => {
      mockExeca.mockRejectedValue(new Error("command not found: gemini") as never);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toBe("command not found: gemini");
    });
  });
});
