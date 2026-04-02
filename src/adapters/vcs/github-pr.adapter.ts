/**
 * GitHub PR アダプター
 * gh CLI を使用して Pull Request 操作を行う。
 */

import { execa } from "execa";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";

export class GitHubPRAdapter implements PullRequestPort {
  /**
   * Pull Request にコメントを追加する。
   */
  async commentOnPr(prNumber: number, body: string): Promise<void> {
    await execa("gh", [
      "pr",
      "comment",
      String(prNumber),
      "--body",
      body,
    ]);
  }

  /**
   * リモートへブランチをプッシュする。
   */
  async pushBranch(branch: string, cwd?: string): Promise<void> {
    await execa("git", ["push", "origin", branch], cwd ? { cwd } : {});
  }

  /**
   * Pull Request を作成する。
   * `gh pr create` は `--json` をサポートしないため stdout（URL）をパースする。
   */
  async createPR(options: {
    title: string;
    body: string;
    base: string;
    head: string;
    draft?: boolean;
  }): Promise<{ number: number; url: string }> {
    const args = [
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
    ];

    if (options.draft) {
      args.push("--draft");
    }

    const { stdout } = await execa("gh", args);

    // stdout は PR の URL（例: https://github.com/owner/repo/pull/123）
    const url = stdout.trim();
    const match = url.match(/\/pull\/(\d+)$/);
    const number = match ? parseInt(match[1], 10) : 0;

    return { number, url };
  }

  /**
   * Pull Request 一覧を取得する。
   */
  async listPRs(options?: {
    head?: string;
  }): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  > {
    const args = [
      "pr",
      "list",
      "--json",
      "number,title,state,url",
    ];

    if (options?.head) {
      args.push("--head", options.head);
    }

    const { stdout } = await execa("gh", args);

    const parsed = JSON.parse(stdout) as Array<{
      number: number;
      title: string;
      state: string;
      url: string;
    }>;

    return parsed;
  }
}
