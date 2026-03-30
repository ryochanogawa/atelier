/**
 * InteractiveSessionUseCase 単体テスト
 *
 * テスト戦略:
 * - MediumPort をモックして AI プロバイダー依存を排除
 * - ファイルシステム操作をモックして永続化ロジックを検証
 * - 会話履歴管理、コンテキスト構築、セッション保存を網羅的にテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義 ----
const mockWriteTextFile = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockListFiles = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  writeTextFile: mockWriteTextFile,
  readTextFile: mockReadTextFile,
  listFiles: mockListFiles,
  fileExists: mockFileExists,
}));

// ---- QueueTaskUseCase のモック (テスト対象外) ----
vi.mock("../../../src/application/use-cases/queue-task.use-case.js", () => ({
  QueueTaskUseCase: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ id: "task-001" }),
    list: vi.fn().mockResolvedValue([]),
  })),
}));

// ---- builtin のモック ----
vi.mock("../../../src/builtin/index.js", () => ({
  getBuiltinPolicyPath: vi.fn().mockReturnValue("/builtin/policies/default-policy.yaml"),
}));

import {
  InteractiveSessionUseCase,
  type ConversationMessage,
} from "../../../src/application/use-cases/interactive-session.use-case.js";
import type { MediumPort, MediumResponse } from "../../../src/adapters/medium/types.js";

// ---- テスト用ヘルパー ----

function createMockMedium(responseContent = "AI response"): MediumPort {
  return {
    name: "mock",
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    execute: vi.fn().mockResolvedValue({
      content: responseContent,
      durationMs: 100,
      exitCode: 0,
      rawStdout: responseContent,
      rawStderr: "",
    } satisfies MediumResponse),
    abort: vi.fn().mockResolvedValue(undefined),
  };
}

const PROJECT_PATH = "/tmp/test-project";

describe("InteractiveSessionUseCase", () => {
  let session: InteractiveSessionUseCase;
  let mockMedium: MediumPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileExists.mockResolvedValue(false);
    mockMedium = createMockMedium();
    session = new InteractiveSessionUseCase(mockMedium, PROJECT_PATH);
  });

  // ---- 1. sendMessage() ----
  describe("sendMessage()", () => {
    it("ユーザーメッセージとAI応答が履歴に追加される", async () => {
      const result = await session.sendMessage("Hello");

      expect(result).toBe("AI response");

      const history = session.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Hello");
      expect(history[1].role).toBe("assistant");
      expect(history[1].content).toBe("AI response");

      // medium.execute が呼ばれたことを確認
      expect(mockMedium.execute).toHaveBeenCalledOnce();
      expect(mockMedium.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Hello"),
          workingDirectory: PROJECT_PATH,
          allowEdit: false,
          allowReadTools: true,
        }),
      );
    });
  });

  // ---- 2. getHistory() ----
  describe("getHistory()", () => {
    it("履歴が正しく返される", async () => {
      // 初期状態は空
      expect(session.getHistory()).toEqual([]);

      // メッセージ送信後に履歴が増える
      await session.sendMessage("First");
      await session.sendMessage("Second");

      const history = session.getHistory();
      expect(history).toHaveLength(4); // user + assistant x 2
      expect(history[0].content).toBe("First");
      expect(history[1].content).toBe("AI response");
      expect(history[2].content).toBe("Second");
      expect(history[3].content).toBe("AI response");

      // 返却されたリストは元の履歴のコピーであること
      history.length = 0;
      expect(session.getHistory()).toHaveLength(4);
    });
  });

  // ---- 3. restoreHistory() ----
  describe("restoreHistory()", () => {
    it("外部から履歴を復元できる", () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "Restored message", timestamp: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "Restored response", timestamp: "2026-01-01T00:00:01.000Z" },
      ];

      session.restoreHistory(messages);

      const history = session.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe("Restored message");
      expect(history[1].content).toBe("Restored response");
    });

    it("既存の履歴が置き換えられる", async () => {
      await session.sendMessage("Old message");
      expect(session.getHistory()).toHaveLength(2);

      session.restoreHistory([
        { role: "user", content: "New", timestamp: "2026-01-01T00:00:00.000Z" },
      ]);

      expect(session.getHistory()).toHaveLength(1);
      expect(session.getHistory()[0].content).toBe("New");
    });
  });

  // ---- 4. buildContextPrompt() - 初回 vs 2回目以降 ----
  describe("buildContextPrompt()", () => {
    it("初回は会話履歴なしのプロンプト", () => {
      // 履歴が空 or 1件以下の場合、currentMessage をそのまま返す
      const prompt = session.buildContextPrompt("Hello");

      expect(prompt).toBe("Hello");
      expect(prompt).not.toContain("会話履歴");
    });

    it("2回目以降は履歴付きプロンプト", async () => {
      // 1回メッセージを送信して履歴を作る
      await session.sendMessage("First question");

      // 次のメッセージのプロンプトを構築（この時点で history に user + assistant = 2件）
      // sendMessage 内で user が追加された後に buildContextPrompt が呼ばれるので
      // 手動テストでは先に user メッセージを追加してシミュレート
      session.restoreHistory([
        { role: "user", content: "First question", timestamp: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "First answer", timestamp: "2026-01-01T00:00:01.000Z" },
        { role: "user", content: "Second question", timestamp: "2026-01-01T00:00:02.000Z" },
      ]);

      const prompt = session.buildContextPrompt("Second question");

      expect(prompt).toContain("会話履歴");
      expect(prompt).toContain("User: First question");
      expect(prompt).toContain("Assistant: First answer");
      expect(prompt).toContain("User: Second question");
    });
  });

  // ---- 5. buildContextPrompt() - Policy Reminder ----
  describe("buildContextPrompt() with Policy", () => {
    it("Policy読み込み時にプロンプト末尾にPolicy Reminderが付く", async () => {
      // ポリシーファイルが存在するようにモック
      mockFileExists.mockResolvedValue(true);
      mockReadTextFile.mockResolvedValue("- ルール1: 丁寧に回答\n- ルール2: 正確に回答");

      await session.loadPolicy();

      // 初回メッセージ
      const prompt = session.buildContextPrompt("Hello");

      expect(prompt).toContain("## Policy");
      expect(prompt).toContain("ルール1: 丁寧に回答");
      expect(prompt).toContain("**Policy Reminder:**");
      expect(prompt).toContain("ポリシー規範を遵守してください");

      // 2回目以降（履歴あり）
      session.restoreHistory([
        { role: "user", content: "Q1", timestamp: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "A1", timestamp: "2026-01-01T00:00:01.000Z" },
        { role: "user", content: "Q2", timestamp: "2026-01-01T00:00:02.000Z" },
      ]);

      const prompt2 = session.buildContextPrompt("Q2");
      expect(prompt2).toContain("## Policy");
      expect(prompt2).toContain("**Policy Reminder:**");
    });
  });

  // ---- 6. saveSession() ----
  describe("saveSession()", () => {
    it("JSONファイルが正しい形式で保存される", async () => {
      mockWriteTextFile.mockResolvedValue(undefined);

      // 履歴を設定
      session.restoreHistory([
        { role: "user", content: "Save me", timestamp: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "Saved!", timestamp: "2026-01-01T00:00:01.000Z" },
      ]);

      const savedPath = await session.saveSession();

      // writeTextFile が呼ばれたことを確認
      expect(mockWriteTextFile).toHaveBeenCalledOnce();

      const [filePath, jsonContent] = mockWriteTextFile.mock.calls[0] as [string, string];

      // ファイルパスが sessions ディレクトリ配下で .json 拡張子
      expect(filePath).toContain("sessions");
      expect(filePath).toMatch(/\.json$/);
      expect(savedPath).toBe(filePath);

      // JSON の構造を検証
      const data = JSON.parse(jsonContent);
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("createdAt", "2026-01-01T00:00:00.000Z");
      expect(data).toHaveProperty("updatedAt");
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].role).toBe("user");
      expect(data.messages[0].content).toBe("Save me");
      expect(data.messages[1].role).toBe("assistant");
      expect(data.messages[1].content).toBe("Saved!");
    });
  });

  // ---- 7. summarizeForTask() ----
  describe("summarizeForTask()", () => {
    it("要約プロンプトがAIに送信され結果が返る", async () => {
      const summaryMedium = createMockMedium("## タスク概要\nSummary content");
      const summarySession = new InteractiveSessionUseCase(summaryMedium, PROJECT_PATH);

      const result = await summarySession.summarizeForTask();

      expect(result).toBe("## タスク概要\nSummary content");
      expect(summaryMedium.execute).toHaveBeenCalledOnce();

      // プロンプトにタスク指示書生成の指示が含まれる
      const callArgs = (summaryMedium.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.prompt).toContain("タスク指示書を生成");
    });

    it("追加指示がある場合はプロンプトに含まれる", async () => {
      const summaryMedium = createMockMedium("Summary with note");
      const summarySession = new InteractiveSessionUseCase(summaryMedium, PROJECT_PATH);

      await summarySession.summarizeForTask("TypeScriptで実装");

      const callArgs = (summaryMedium.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.prompt).toContain("TypeScriptで実装");
    });
  });
});
