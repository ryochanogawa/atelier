/**
 * Issue Tracker Port
 * GitHub Issue 等の課題管理システムとの通信ポート（インターフェースのみ）。
 */

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
}

export interface IssueTrackerPort {
  getIssue(owner: string, repo: string, number: number): Promise<Issue>;
  addComment(owner: string, repo: string, number: number, body: string): Promise<void>;
  closeIssue(owner: string, repo: string, number: number): Promise<void>;
}
