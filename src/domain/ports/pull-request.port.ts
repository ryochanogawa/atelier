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
  }): Promise<{ number: number; url: string }>;

  listPRs(): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  >;
}
