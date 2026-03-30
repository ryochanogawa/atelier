/**
 * Git VCS アダプター
 * simple-git を使用してGit操作を行う。
 */

import { simpleGit, type SimpleGit } from "simple-git";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { VcsPort } from "./types.js";

const WORKTREE_BASE_DIR = ".atelier/studios";
const DEFAULT_BRANCH_PREFIX = "atelier/";

export class GitAdapter implements VcsPort {
  private readonly git: SimpleGit;
  private readonly branchPrefix: string;

  constructor(repoPath?: string, branchPrefix?: string) {
    this.git = simpleGit(repoPath);
    this.branchPrefix = branchPrefix ?? DEFAULT_BRANCH_PREFIX;
  }

  /**
   * 指定ブランチのworktreeを `.atelier/studios/<id>/` に作成する。
   * @returns worktreeの絶対パス
   */
  async createWorktree(branch: string, basePath: string): Promise<string> {
    const id = randomUUID().slice(0, 8);
    const worktreePath = join(basePath, WORKTREE_BASE_DIR, id);

    await this.git.raw(["worktree", "add", worktreePath, branch]);

    return worktreePath;
  }

  /**
   * ワークツリー内の変更をステージしてコミットする。
   * @returns コミットハッシュ
   */
  async commit(worktreePath: string, message: string): Promise<string> {
    const worktreeGit = simpleGit(worktreePath);

    await worktreeGit.add(".");
    const result = await worktreeGit.commit(message);

    return result.commit;
  }

  /**
   * ワークツリーを削除する。
   */
  async cleanup(worktreePath: string): Promise<void> {
    try {
      await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
    } catch {
      // worktree removeが失敗した場合、ディレクトリを直接削除してpruneする
      await rm(worktreePath, { recursive: true, force: true });
      await this.git.raw(["worktree", "prune"]);
    }
  }

  /**
   * atelier/ 接頭辞付きのブランチを作成する。
   */
  async createBranch(name: string): Promise<void> {
    const branchName = name.startsWith(this.branchPrefix)
      ? name
      : `${this.branchPrefix}${name}`;

    await this.git.checkoutLocalBranch(branchName);
  }
}
