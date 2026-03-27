/**
 * VCS ポートインターフェース定義
 */

export interface VcsPort {
  createWorktree(branch: string, basePath: string): Promise<string>;
  commit(worktreePath: string, message: string): Promise<string>;
  cleanup(worktreePath: string): Promise<void>;
  createBranch(name: string): Promise<void>;
}
