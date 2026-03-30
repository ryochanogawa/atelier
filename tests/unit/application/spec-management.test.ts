/**
 * SpecManagementUseCase 単体テスト
 *
 * テスト戦略:
 * - ファイルシステム操作を vi.mock() でモックして依存を排除
 * - timestamp を固定値にして再現性を確保
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義 ----
const mockEnsureDir = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());
const mockDirExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockWriteTextFile = vi.hoisted(() => vi.fn());
const mockListDirs = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockTimestamp = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
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
    timestamp: mockTimestamp,
  };
});

import { SpecManagementUseCase } from "../../../src/application/use-cases/spec-management.use-case.js";
import type { SpecJson } from "../../../src/application/use-cases/spec-management.use-case.js";

// ---- 定数 ----
const PROJECT_PATH = "/tmp/test-project";
const SPECS_DIR = "/tmp/test-project/.atelier/specs";
const FIXED_TIMESTAMP = "2026-03-30T00:00:00.000Z";

describe("SpecManagementUseCase", () => {
  let useCase: SpecManagementUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTimestamp.mockReturnValue(FIXED_TIMESTAMP);
    mockEnsureDir.mockResolvedValue(undefined);
    mockWriteTextFile.mockResolvedValue(undefined);
    useCase = new SpecManagementUseCase(PROJECT_PATH);
  });

  // =========================================================================
  // create()
  // =========================================================================
  describe("create()", () => {
    it("連番ID '001' を採番し、spec.json と slug を生成する", async () => {
      // specs ディレクトリが存在しない（初回）
      mockDirExists.mockResolvedValue(false);

      const result = await useCase.create("User Authentication");

      expect(result.id).toBe("001");
      expect(result.path).toBe(`${SPECS_DIR}/001-user-authentication`);

      // spec.json が正しい内容で書き込まれること
      expect(mockWriteTextFile).toHaveBeenCalledOnce();
      const [writePath, writeContent] = mockWriteTextFile.mock.calls[0];
      expect(writePath).toBe(`${SPECS_DIR}/001-user-authentication/spec.json`);

      const written: SpecJson = JSON.parse(writeContent);
      expect(written).toEqual({
        id: "001",
        name: "user-authentication",
        description: "User Authentication",
        phase: "requirements",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      });
    });

    it("2回目の create で ID が '002' になる", async () => {
      // specs ディレクトリが存在し、001-xxx が既にある
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-authentication"]);

      const result = await useCase.create("Payment Gateway");

      expect(result.id).toBe("002");
      expect(result.path).toBe(`${SPECS_DIR}/002-payment-gateway`);
    });
  });

  // =========================================================================
  // generateDesign()
  // =========================================================================
  describe("generateDesign()", () => {
    it("requirements.md 存在時に phase を 'design' に更新する", async () => {
      // resolveSpecDir が成功するようにセットアップ
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-auth"]);
      mockFileExists.mockImplementation(async (p: string) => {
        if (p.endsWith("spec.json")) return true;
        if (p.endsWith("requirements.md")) return true;
        return false;
      });

      const existingSpec: SpecJson = {
        id: "001",
        name: "user-auth",
        description: "ユーザー認証",
        phase: "requirements",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      };
      mockReadTextFile.mockResolvedValue(JSON.stringify(existingSpec));

      const specDir = await useCase.generateDesign("001");

      expect(specDir).toBe(`${SPECS_DIR}/001-user-auth`);

      // spec.json が design フェーズで書き込まれること
      expect(mockWriteTextFile).toHaveBeenCalledOnce();
      const [, writeContent] = mockWriteTextFile.mock.calls[0];
      const updated: SpecJson = JSON.parse(writeContent);
      expect(updated.phase).toBe("design");
      expect(updated.updated_at).toBe(FIXED_TIMESTAMP);
    });

    it("requirements.md が存在しない場合にエラーをスローする", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-auth"]);
      mockFileExists.mockImplementation(async (p: string) => {
        if (p.endsWith("spec.json")) return true;
        // requirements.md は存在しない
        return false;
      });

      await expect(useCase.generateDesign("001")).rejects.toThrow(
        "requirements.md が存在しません",
      );
    });
  });

  // =========================================================================
  // generateTasks()
  // =========================================================================
  describe("generateTasks()", () => {
    it("requirements.md + design.md 存在時に phase を 'tasks' に更新する", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-auth"]);
      mockFileExists.mockImplementation(async (p: string) => {
        if (p.endsWith("spec.json")) return true;
        if (p.endsWith("requirements.md")) return true;
        if (p.endsWith("design.md")) return true;
        return false;
      });

      const existingSpec: SpecJson = {
        id: "001",
        name: "user-auth",
        description: "ユーザー認証",
        phase: "design",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      };
      mockReadTextFile.mockResolvedValue(JSON.stringify(existingSpec));

      const specDir = await useCase.generateTasks("001");

      expect(specDir).toBe(`${SPECS_DIR}/001-user-auth`);

      expect(mockWriteTextFile).toHaveBeenCalledOnce();
      const [, writeContent] = mockWriteTextFile.mock.calls[0];
      const updated: SpecJson = JSON.parse(writeContent);
      expect(updated.phase).toBe("tasks");
    });

    it("design.md が存在しない場合にエラーをスローする", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-auth"]);
      mockFileExists.mockImplementation(async (p: string) => {
        if (p.endsWith("spec.json")) return true;
        if (p.endsWith("requirements.md")) return true;
        // design.md は存在しない
        return false;
      });

      await expect(useCase.generateTasks("001")).rejects.toThrow(
        "design.md が存在しません",
      );
    });
  });

  // =========================================================================
  // list()
  // =========================================================================
  describe("list()", () => {
    it("複数 spec の一覧が ID 昇順で返る", async () => {
      mockDirExists.mockResolvedValue(true);
      // わざと逆順で返す
      mockListDirs.mockResolvedValue(["002-payment", "001-user-auth"]);

      const spec1: SpecJson = {
        id: "001",
        name: "user-auth",
        description: "ユーザー認証",
        phase: "requirements",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      };
      const spec2: SpecJson = {
        id: "002",
        name: "payment",
        description: "決済機能",
        phase: "design",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      };

      mockFileExists.mockResolvedValue(true);
      mockReadTextFile.mockImplementation(async (p: string) => {
        if (p.includes("001-user-auth")) return JSON.stringify(spec1);
        if (p.includes("002-payment")) return JSON.stringify(spec2);
        throw new Error("unexpected path");
      });

      const result = await useCase.list();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("001");
      expect(result[0].name).toBe("user-auth");
      expect(result[0].phase).toBe("requirements");
      expect(result[1].id).toBe("002");
      expect(result[1].name).toBe("payment");
      expect(result[1].phase).toBe("design");
    });
  });

  // =========================================================================
  // show()
  // =========================================================================
  describe("show()", () => {
    it("spec.json の内容とファイル一覧が返る", async () => {
      mockDirExists.mockResolvedValue(true);
      mockListDirs.mockResolvedValue(["001-user-auth"]);
      mockFileExists.mockResolvedValue(true);

      const specData: SpecJson = {
        id: "001",
        name: "user-auth",
        description: "ユーザー認証",
        phase: "design",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      };
      mockReadTextFile.mockResolvedValue(JSON.stringify(specData));

      mockListFiles.mockResolvedValue([
        `${SPECS_DIR}/001-user-auth/spec.json`,
        `${SPECS_DIR}/001-user-auth/requirements.md`,
        `${SPECS_DIR}/001-user-auth/design.md`,
      ]);

      const result = await useCase.show("001");

      expect(result.spec).toEqual(specData);
      expect(result.files).toEqual([
        "spec.json",
        "requirements.md",
        "design.md",
      ]);
    });
  });
});
