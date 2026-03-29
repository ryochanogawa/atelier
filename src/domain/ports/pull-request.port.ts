/**
 * Pull Request Port
 * PR 作成・管理のためのポート（インターフェースのみ）。
 */

export interface PullRequestPort {
  createPR(options: {
    title: string;
    body: string;
    base: string;
    head: string;
    draft?: boolean;
  }): Promise<{ number: number; url: string }>;

  listPRs(options?: {
    head?: string;
  }): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  >;

  pushBranch(branch: string): Promise<void>;

  commentOnPr(prNumber: number, body: string): Promise<void>;
}
