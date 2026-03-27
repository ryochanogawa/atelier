/**
 * Interactive Session Use Case
 * 対話モードのセッション管理。Medium呼び出し、会話履歴管理、タスクキューへの追加を行う。
 */

import type { MediumPort, MediumRequest, MediumResponse } from "../../adapters/medium/types.js";
import { QueueTaskUseCase } from "./queue-task.use-case.js";
import { DEFAULT_TIMEOUT_MS } from "../../shared/constants.js";

/** 会話メッセージ */
export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string;
}

/**
 * InteractiveSessionUseCase
 * 対話セッションの管理を行う。
 */
export class InteractiveSessionUseCase {
  private readonly history: ConversationMessage[] = [];
  private readonly medium: MediumPort;
  private readonly queueUseCase: QueueTaskUseCase;
  private readonly workingDirectory: string;

  constructor(
    medium: MediumPort,
    projectPath: string,
  ) {
    this.medium = medium;
    this.workingDirectory = projectPath;
    this.queueUseCase = new QueueTaskUseCase(projectPath);
  }

  /** ユーザーメッセージを送信し、AIの応答を取得する */
  async sendMessage(userMessage: string): Promise<string> {
    this.history.push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // 会話履歴をコンテキストとして含めたプロンプトを構築
    const contextPrompt = this.buildContextPrompt(userMessage);

    const request: MediumRequest = {
      prompt: contextPrompt,
      workingDirectory: this.workingDirectory,
      allowEdit: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };

    const response: MediumResponse = await this.medium.execute(request);

    this.history.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
    });

    return response.content;
  }

  /** 現在の会話からタスクを作成してキューに追加する */
  async queueTask(description: string): Promise<string> {
    const task = await this.queueUseCase.execute({
      description,
      source: "interactive",
    });
    return task.id;
  }

  /** キュー内のタスク一覧を取得する */
  async listTasks() {
    return this.queueUseCase.list();
  }

  /** 会話履歴を取得する */
  getHistory(): readonly ConversationMessage[] {
    return [...this.history];
  }

  /** 会話履歴を含めたプロンプトを構築する */
  private buildContextPrompt(currentMessage: string): string {
    if (this.history.length <= 1) {
      return currentMessage;
    }

    // 直近の会話履歴（最大10件）をコンテキストとして含める
    const recentHistory = this.history.slice(-10, -1);
    const contextLines = recentHistory.map(
      (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
    );

    return [
      "以下は会話の履歴です:",
      ...contextLines,
      "",
      `User: ${currentMessage}`,
    ].join("\n");
  }
}
