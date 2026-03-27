/**
 * VCS Port
 * バージョン管理システムとの通信ポート（インターフェースのみ）。
 */

export interface VcsPort {
  /** ワークツリーを作成する */
  createWorktree(branchName: string, basePath: string): Promise<string>;

  /** 変更をコミットする */
  commit(worktreePath: string, message: string): Promise<string>;

  /** ワークツリーをクリーンアップする */
  cleanup(worktreePath: string): Promise<void>;

  /** ブランチを作成する */
  createBranch(branchName: string, baseBranch?: string): Promise<void>;
}
