/**
 * serve ハンドラーの単体テスト
 *
 * WebSocket サーバーは起動せず、ハンドラーロジックのみテストする。
 * AtelierWsServer の registerHandler を模倣し、
 * 登録されたハンドラー関数を直接呼び出してリクエスト/レスポンスを検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RpcHandler } from "../../../src/infrastructure/server/ws-server.js";

// ---- fs/spec のモック ----
const mockEnsureDir = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());
const mockDirExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockWriteTextFile = vi.hoisted(() => vi.fn());
const mockListDirs = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());

vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  ensureDir: mockEnsureDir,
  fileExists: mockFileExists,
  dirExists: mockDirExists,
  readTextFile: mockReadTextFile,
  writeTextFile: mockWriteTextFile,
  listDirs: mockListDirs,
  listFiles: mockListFiles,
}));

vi.mock("../../../src/shared/utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/shared/utils.js")>();
  return {
    ...original,
    timestamp: () => "2026-03-30T00:00:00.000Z",
  };
});

import { registerSpecHandlers } from "../../../src/infrastructure/server/handlers/spec-handler.js";
import { registerWorkspaceHandlers } from "../../../src/infrastructure/server/handlers/workspace-handler.js";

// ---- FakeServer: registerHandler を捕捉 ----
function createFakeServer() {
  const handlers = new Map<string, RpcHandler>();
  return {
    registerHandler(method: string, handler: RpcHandler) {
      handlers.set(method, handler);
    },
    getHandler(method: string): RpcHandler | undefined {
      return handlers.get(method);
    },
    handlers,
  };
}

// =========================================================
// spec-handler テスト
// =========================================================
describe("spec-handler", () => {
  let server: ReturnType<typeof createFakeServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createFakeServer();
    registerSpecHandlers(server as any, "/test/project");
  });

  describe("spec.list", () => {
    it("should register spec.list handler", () => {
      expect(server.getHandler("spec.list")).toBeDefined();
    });

    it("should return empty array when no specs exist", async () => {
      mockDirExists.mockResolvedValue(false);

      const handler = server.getHandler("spec.list")!;
      const result = await handler({});
      expect(result).toEqual([]);
    });

    it("should return spec summaries", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-auth", "002-billing"]);
      mockFileExists.mockResolvedValue(true);
      mockReadTextFile
        .mockResolvedValueOnce(
          JSON.stringify({
            id: "001",
            name: "auth",
            phase: "requirements",
            created_at: "2026-03-30T00:00:00.000Z",
            updated_at: "2026-03-30T00:00:00.000Z",
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            id: "002",
            name: "billing",
            phase: "design",
            created_at: "2026-03-30T00:00:00.000Z",
            updated_at: "2026-03-30T00:00:00.000Z",
          }),
        );

      const handler = server.getHandler("spec.list")!;
      const result = (await handler({})) as any[];
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: "001", name: "auth", phase: "requirements" });
      expect(result[1]).toMatchObject({ id: "002", name: "billing", phase: "design" });
    });
  });

  describe("spec.show", () => {
    it("should register spec.show handler", () => {
      expect(server.getHandler("spec.show")).toBeDefined();
    });

    it("should throw when id is missing", async () => {
      const handler = server.getHandler("spec.show")!;
      await expect(handler({})).rejects.toThrow("params.id is required");
    });

    it("should return spec detail and files", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-auth"]);
      mockFileExists.mockResolvedValue(true);
      mockReadTextFile.mockResolvedValue(
        JSON.stringify({
          id: "001",
          name: "auth",
          description: "Authentication feature",
          phase: "requirements",
          created_at: "2026-03-30T00:00:00.000Z",
          updated_at: "2026-03-30T00:00:00.000Z",
        }),
      );
      mockListFiles.mockResolvedValue([
        "/test/project/.atelier/specs/001-auth/spec.json",
        "/test/project/.atelier/specs/001-auth/requirements.md",
      ]);

      const handler = server.getHandler("spec.show")!;
      const result = (await handler({ id: "001" })) as any;
      expect(result.spec.id).toBe("001");
      expect(result.spec.name).toBe("auth");
      expect(result.files).toEqual(["spec.json", "requirements.md"]);
    });

    it("should throw when spec not found", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue([]);

      const handler = server.getHandler("spec.show")!;
      await expect(handler({ id: "999" })).rejects.toThrow();
    });
  });
});

// =========================================================
// workspace-handler テスト
// =========================================================
describe("workspace-handler", () => {
  let server: ReturnType<typeof createFakeServer>;
  const workspaces = ["/workspace/a", "/workspace/b"];

  beforeEach(() => {
    server = createFakeServer();
    registerWorkspaceHandlers(server as any, workspaces);
  });

  describe("workspace.list", () => {
    it("should return registered workspaces", async () => {
      const handler = server.getHandler("workspace.list")!;
      const result = (await handler({})) as any;
      expect(result.workspaces).toEqual(workspaces);
    });
  });

  describe("workspace.info", () => {
    it("should return workspace info", async () => {
      const handler = server.getHandler("workspace.info")!;
      const result = (await handler({ path: "/workspace/a" })) as any;
      expect(result.path).toBe("/workspace/a");
      expect(result.name).toBe("a");
    });
  });
});

// =========================================================
// status handler テスト (serve.cmd 内で直接登録されるロジック)
// =========================================================
describe("status handler logic", () => {
  it("should return server status info", async () => {
    const startedAt = new Date().toISOString();
    const port = 3000;
    const workspaces = ["/test/workspace"];

    // Replicate status handler logic from serve.cmd.ts
    const statusHandler: RpcHandler = async () => ({
      status: "running",
      port,
      workspaces,
      startedAt,
      uptime: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
      handlers: [
        "fs.readDir",
        "fs.readFile",
        "fs.writeFile",
        "fs.stat",
        "workspace.list",
        "workspace.info",
        "spec.list",
        "spec.show",
        "status",
      ],
    });

    const result = (await statusHandler({})) as any;
    expect(result.status).toBe("running");
    expect(result.port).toBe(3000);
    expect(result.workspaces).toEqual(["/test/workspace"]);
    expect(result.handlers).toContain("spec.list");
    expect(result.handlers).toContain("spec.show");
    expect(result.handlers).toContain("status");
    expect(typeof result.uptime).toBe("number");
  });
});
