import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MediumExecuteRequest } from "../../../src/domain/ports/medium.port.js";

// execa モック
vi.mock("execa", () => {
  const execaMock = vi.fn();
  return { execa: execaMock };
});

import { execa } from "execa";
import { CodexAdapter } from "../../../src/adapters/medium/codex.adapter.js";

const mockExeca = vi.mocked(execa);

function makeRequest(overrides: Partial<MediumExecuteRequest> = {}): MediumExecuteRequest {
  return {
    prompt: "Implement a function",
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

describe("CodexAdapter", () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter();
    vi.clearAllMocks();
  });

  describe("name", () => {
    it('"codex" という名前を持つ', () => {
      expect(adapter.name).toBe("codex");
    });
  });

  describe("execute - stdin経由のプロンプト", () => {
    it("プロンプトが stdin (input) 経由で渡される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ prompt: "my prompt text" }));

      const options = mockExeca.mock.calls[0][2] as Record<string, unknown>;
      expect(options.input).toBe("my prompt text");
    });

    it("プロンプトはコマンド引数に含まれない", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ prompt: "secret prompt" }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain("secret prompt");
    });
  });

  describe("buildArgs - full-auto mode", () => {
    it("allowEdit: false の場合 --full-auto フラグが含まれない", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ allowEdit: false }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain("--full-auto");
    });

    it("allowEdit: true の場合 --full-auto フラグが含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ allowEdit: true }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--full-auto");
    });

    it("exec サブコマンドで実行される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest());

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args[0]).toBe("exec");
    });
  });

  describe("buildArgs - extraArgs", () => {
    it("extraArgs が指定された場合に引数に含まれる", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "output" }) as ReturnType<typeof execa>);

      await adapter.execute(makeRequest({ extraArgs: ["--timeout", "60"] }));

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain("--timeout");
      expect(args).toContain("60");
    });
  });

  describe("parseResponse", () => {
    it("stdout がトリムされて content に設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "  output with spaces  " }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.content).toBe("output with spaces");
    });

    it("rawStdout はトリム前の値が設定される", async () => {
      const rawOutput = "  raw output  ";
      mockExeca.mockReturnValue(makeExecaResult({ stdout: rawOutput }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.rawStdout).toBe(rawOutput);
    });

    it("exitCode が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", exitCode: 2 }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.exitCode).toBe(2);
    });

    it("rawStderr が正しく設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok", stderr: "some error" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(response.rawStderr).toBe("some error");
    });

    it("durationMs が数値として設定される", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "ok" }) as ReturnType<typeof execa>);

      const response = await adapter.execute(makeRequest());

      expect(typeof response.durationMs).toBe("number");
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("checkAvailability", () => {
    it("codex --version が成功した場合 available: true を返す", async () => {
      mockExeca.mockReturnValue(makeExecaResult({ stdout: "0.1.0" }) as ReturnType<typeof execa>);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.version).toBe("0.1.0");
    });

    it("codex --version が失敗した場合 available: false を返す", async () => {
      mockExeca.mockRejectedValue(new Error("command not found: codex") as never);

      const result = await adapter.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.reason).toBe("command not found: codex");
    });
  });
});
