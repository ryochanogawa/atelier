/**
 * GitHub PR アダプター
 * gh CLI を使用して Pull Request 操作を行う。
 */

import { execa } from "execa";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";

export class GitHubPRAdapter implements PullRequestPort {
  /**
   * Pull Request を作成する。
   */
  async createPR(options: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<{ number: number; url: string }> {
    const { stdout } = await execa("gh", [
      "pr",
      "create",
      "--title",
      options.title,
      "--body",
      options.body,
      "--base",
      options.base,
      "--head",
      options.head,
      "--json",
      "number,url",
    ]);

    const parsed = JSON.parse(stdout) as { number: number; url: string };
    return { number: parsed.number, url: parsed.url };
  }

  /**
   * Pull Request 一覧を取得する。
   */
  async listPRs(): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  > {
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--json",
      "number,title,state,url",
    ]);

    const parsed = JSON.parse(stdout) as Array<{
      number: number;
      title: string;
      state: string;
      url: string;
    }>;

    return parsed;
  }
}
