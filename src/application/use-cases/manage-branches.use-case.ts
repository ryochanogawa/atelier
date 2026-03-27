/**
 * Manage Branches Use Case
 * atelier/ プレフィックスのブランチ管理。一覧・マージ・削除・再実行を行う。
 */

import { simpleGit, type SimpleGit } from "simple-git";

const BRANCH_PREFIX = "atelier/";

/** ブランチ情報 */
export interface BranchInfo {
  readonly name: string;
  readonly current: boolean;
  readonly commit: string;
  readonly label: string;
}

/**
 * ManageBranchesUseCase
 * atelier/ プレフィックス付きブランチの管理を行う。
 */
export class ManageBranchesUseCase {
  private readonly git: SimpleGit;

  constructor(projectPath: string) {
    this.git = simpleGit(projectPath);
  }

  /** atelier/ プレフィックスのブランチ一覧を取得する */
  async listBranches(): Promise<BranchInfo[]> {
    const branchSummary = await this.git.branch(["-a", "--list", `${BRANCH_PREFIX}*`]);
    const branches: BranchInfo[] = [];

    for (const [name, data] of Object.entries(branchSummary.branches)) {
      if (name.startsWith(BRANCH_PREFIX) || name.includes(`/${BRANCH_PREFIX}`)) {
        branches.push({
          name,
          current: data.current,
          commit: data.commit,
          label: data.label,
        });
      }
    }

    return branches;
  }

  /** 指定ブランチをメインブランチにマージする */
  async mergeBranch(name: string): Promise<void> {
    const branchName = this.ensurePrefix(name);

    // 現在のブランチを取得
    const currentBranch = await this.getCurrentBranch();

    // メインブランチにチェックアウト
    const mainBranch = await this.getMainBranch();
    await this.git.checkout(mainBranch);

    try {
      await this.git.merge([branchName]);
    } catch (error) {
      // マージに失敗した場合、元のブランチに戻す
      await this.git.checkout(currentBranch);
      throw error;
    }
  }

  /** 指定ブランチを削除する（worktreeも削除） */
  async deleteBranch(name: string): Promise<void> {
    const branchName = this.ensurePrefix(name);

    // worktree があれば削除
    try {
      const worktrees = await this.git.raw(["worktree", "list", "--porcelain"]);
      const lines = worktrees.split("\n");
      for (const line of lines) {
        if (line.startsWith("branch ") && line.includes(branchName)) {
          // 対応する worktree パスを取得して削除
          const idx = lines.indexOf(line);
          if (idx > 0) {
            const worktreeLine = lines[idx - 1];
            if (worktreeLine?.startsWith("worktree ")) {
              const worktreePath = worktreeLine.replace("worktree ", "");
              await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
            }
          }
        }
      }
    } catch {
      // worktree 操作に失敗しても続行
    }

    // ブランチを削除
    await this.git.deleteLocalBranch(branchName, true);
  }

  /** 指定ブランチの再実行（ブランチを再作成） */
  async retryBranch(name: string): Promise<void> {
    const branchName = this.ensurePrefix(name);

    // 現在のメインブランチを取得
    const mainBranch = await this.getMainBranch();

    // ブランチを削除して再作成
    try {
      await this.deleteBranch(name);
    } catch {
      // 既に削除されている場合は無視
    }

    await this.git.checkoutBranch(branchName, mainBranch);

    // メインブランチに戻る
    await this.git.checkout(mainBranch);
  }

  /** 現在のブランチ名を取得する */
  private async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(["--abbrev-ref", "HEAD"]);
    return result.trim();
  }

  /** メインブランチ名を取得する */
  private async getMainBranch(): Promise<string> {
    try {
      await this.git.revparse(["--verify", "main"]);
      return "main";
    } catch {
      return "master";
    }
  }

  /** atelier/ プレフィックスを付与する */
  private ensurePrefix(name: string): string {
    return name.startsWith(BRANCH_PREFIX) ? name : `${BRANCH_PREFIX}${name}`;
  }
}
