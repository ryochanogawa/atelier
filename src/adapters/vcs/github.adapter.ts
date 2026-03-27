/**
 * GitHub Issue アダプター
 * gh CLI を使用して GitHub Issue 操作を行う。
 */

import { execa } from "execa";
import type { Issue, IssueTrackerPort } from "../../domain/ports/issue-tracker.port.js";

export class GitHubIssueAdapter implements IssueTrackerPort {
  /**
   * Issue を取得する。
   */
  async getIssue(owner: string, repo: string, number: number): Promise<Issue> {
    const { stdout } = await execa("gh", [
      "issue",
      "view",
      String(number),
      "--repo",
      `${owner}/${repo}`,
      "--json",
      "number,title,body,labels,url",
    ]);

    const parsed = JSON.parse(stdout) as {
      number: number;
      title: string;
      body: string;
      labels: Array<{ name: string }>;
      url: string;
    };

    return {
      number: parsed.number,
      title: parsed.title,
      body: parsed.body,
      labels: parsed.labels.map((l) => l.name),
      url: parsed.url,
    };
  }

  /**
   * Issue にコメントを追加する。
   */
  async addComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<void> {
    await execa("gh", [
      "issue",
      "comment",
      String(number),
      "--repo",
      `${owner}/${repo}`,
      "--body",
      body,
    ]);
  }

  /**
   * Issue をクローズする。
   */
  async closeIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<void> {
    await execa("gh", [
      "issue",
      "close",
      String(number),
      "--repo",
      `${owner}/${repo}`,
    ]);
  }

  /**
   * 現在のリポジトリの owner/repo を取得する。
   */
  async getCurrentRepo(): Promise<{ owner: string; repo: string }> {
    const { stdout } = await execa("gh", [
      "repo",
      "view",
      "--json",
      "nameWithOwner",
    ]);

    const parsed = JSON.parse(stdout) as { nameWithOwner: string };
    const [owner, repo] = parsed.nameWithOwner.split("/");

    return { owner: owner!, repo: repo! };
  }
}
