/**
 * GitLab MR アダプター
 * glab CLI を使用して Merge Request 操作を行う。
 */

import { execa } from "execa";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";

export class GitLabMRAdapter implements PullRequestPort {
  /**
   * Merge Request にコメントを追加する。
   */
  async commentOnPr(prNumber: number, body: string): Promise<void> {
    await execa("glab", [
      "mr",
      "comment",
      String(prNumber),
      "--message",
      body,
    ]);
  }

  /**
   * リモートへブランチをプッシュする。
   */
  async pushBranch(branch: string): Promise<void> {
    await execa("git", ["push", "origin", branch]);
  }

  /**
   * Merge Request を作成する。
   */
  async createPR(options: {
    title: string;
    body: string;
    base: string;
    head: string;
    draft?: boolean;
  }): Promise<{ number: number; url: string }> {
    const args = [
      "mr",
      "create",
      "--title",
      options.title,
      "--description",
      options.body,
      "--target-branch",
      options.base,
      "--source-branch",
      options.head,
      "--no-editor",
    ];

    if (options.draft) {
      args.push("--draft");
    }

    const { stdout } = await execa("glab", args);

    // glab mr create の出力から URL と MR 番号をパースする
    const url = stdout.trim();
    const match = url.match(/\/merge_requests\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;

    return { number, url };
  }

  /**
   * Merge Request 一覧を取得する。
   */
  async listPRs(options?: {
    head?: string;
  }): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  > {
    const args = [
      "api",
      "projects/:id/merge_requests",
      "--method",
      "GET",
      "-f",
      "state=opened",
    ];

    if (options?.head) {
      args.push("-f", `source_branch=${options.head}`);
    }

    const { stdout } = await execa("glab", args);

    const parsed = JSON.parse(stdout) as Array<{
      iid: number;
      title: string;
      state: string;
      web_url: string;
    }>;

    return parsed.map((mr) => ({
      number: mr.iid,
      title: mr.title,
      state: mr.state,
      url: mr.web_url,
    }));
  }
}
