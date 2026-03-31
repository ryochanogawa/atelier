/**
 * Manage Branches Use Case
 * atelier/ プレフィックスのブランチ管理。worktree と連携して一覧・マージ・削除・再実行を行う。
 */

import { simpleGit, type SimpleGit } from "simple-git";
import path from "node:path";

const BRANCH_PREFIX = "atelier/";
const WORKTREES_DIR = ".atelier/worktrees";

/** ブランチ情報 */
export interface BranchInfo {
  readonly name: string;
  readonly current: boolean;
  readonly commit: string;
  readonly label: string;
  readonly worktreePath: string | null;
}

/**
 * ManageBranchesUseCase
 * atelier/ プレフィックス付きブランチの管理を行う。
 * worktree と連携し、takt と同等のブランチ管理を提供する。
 */
export class ManageBranchesUseCase {
  private readonly git: SimpleGit;
  private readonly projectPath: string;

  constructor(projectPath: string) {
    this.git = simpleGit(projectPath);
    this.projectPath = projectPath;
  }

  /** atelier/ プレフィックスのブランチ一覧を取得する（worktree 情報付き） */
  async listBranches(): Promise<BranchInfo[]> {
    // worktree 一覧を取得してブランチ→パスのマッピングを作成
    const worktreeMap = await this.getWorktreeMap();

    const branchSummary = await this.git.branch(["-a", "--list", `${BRANCH_PREFIX}*`]);
    const branches: BranchInfo[] = [];

    for (const [name, data] of Object.entries(branchSummary.branches)) {
      if (name.startsWith(BRANCH_PREFIX) || name.includes(`/${BRANCH_PREFIX}`)) {
        const fullRef = `refs/heads/${name}`;
        const worktreePath = worktreeMap.get(fullRef) ?? worktreeMap.get(name) ?? null;

        branches.push({
          name,
          current: data.current,
          commit: data.commit,
          label: data.label,
          worktreePath,
        });
      }
    }

    return branches;
  }

  /** 指定ブランチをメインブランチにマージし、worktree + ブランチを削除する */
  async mergeBranch(name: string): Promise<string> {
    const branchName = this.ensurePrefix(name);

    // 現在のブランチを取得
    const currentBranch = await this.getCurrentBranch();

    // マージ先を決定: 派生元ブランチ（atelier/ ブランチの親）を特定する
    const mergeTo = await this.getParentBranch(branchName, currentBranch);
    await this.git.checkout(mergeTo);

    try {
      await this.git.merge([branchName]);
    } catch (error) {
      // マージに失敗した場合、元のブランチに戻す
      await this.git.checkout(currentBranch);
      throw error;
    }

    // マージ成功後、worktree とブランチを削除
    try {
      await this.removeWorktreeForBranch(branchName);
    } catch {
      // worktree 削除に失敗しても続行
    }

    try {
      await this.git.deleteLocalBranch(branchName, true);
    } catch {
      // ブランチ削除に失敗しても続行（既にマージ済み）
    }

    return mergeTo;
  }

  /** 指定ブランチを削除する（worktreeも削除） */
  async deleteBranch(name: string): Promise<void> {
    const branchName = this.ensurePrefix(name);

    // worktree を削除
    await this.removeWorktreeForBranch(branchName);

    // ブランチを削除
    await this.git.deleteLocalBranch(branchName, true);
  }

  /** 指定ブランチの worktree で再実行する（worktree を保持したまま） */
  async retryBranch(name: string): Promise<{ branchName: string; worktreePath: string }> {
    const branchName = this.ensurePrefix(name);
    const mainBranch = await this.getMainBranch();

    // ブランチが存在するか確認
    const branches = await this.git.branchLocal();
    if (!branches.all.includes(branchName)) {
      throw new Error(`ブランチ '${branchName}' が見つかりません`);
    }

    // 既存の worktree パスを取得
    const worktreeMap = await this.getWorktreeMap();
    const fullRef = `refs/heads/${branchName}`;
    let worktreePath = worktreeMap.get(fullRef) ?? worktreeMap.get(branchName) ?? null;

    // worktree がなければ新しく作成
    if (!worktreePath) {
      const safeName = branchName.replace(/\//g, "-");
      worktreePath = path.join(this.projectPath, WORKTREES_DIR, safeName);
      await this.git.raw(["worktree", "add", worktreePath, branchName]);
    }

    return { branchName, worktreePath };
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

  /**
   * atelier/ ブランチの派生元ブランチを特定する。
   * 1. worktree内の .atelier-parent-branch ファイルを読む（確実）
   * 2. なければ現在のブランチにフォールバック
   */
  private async getParentBranch(atelierBranch: string, currentBranch: string): Promise<string> {
    // worktree パスを特定
    const worktreeMap = await this.getWorktreeMap();
    const fullRef = `refs/heads/${atelierBranch}`;
    const worktreePath = worktreeMap.get(fullRef) ?? worktreeMap.get(atelierBranch);

    if (worktreePath) {
      try {
        const fs = await import("node:fs/promises");
        const parentBranch = (await fs.readFile(
          path.join(worktreePath, ".atelier-parent-branch"),
          "utf-8",
        )).trim();
        if (parentBranch) {
          // 派生元ブランチがまだ存在するか確認
          const branches = await this.git.branchLocal();
          if (branches.all.includes(parentBranch)) {
            return parentBranch;
          }
        }
      } catch {
        // ファイルがない場合はフォールバック
      }
    }

    // フォールバック: 現在のブランチ
    return currentBranch;
  }

  /** atelier/ プレフィックスを付与する */
  private ensurePrefix(name: string): string {
    return name.startsWith(BRANCH_PREFIX) ? name : `${BRANCH_PREFIX}${name}`;
  }

  /** worktree 一覧を取得して branch → path のマップを作成する */
  private async getWorktreeMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    try {
      const worktreeOutput = await this.git.raw(["worktree", "list", "--porcelain"]);
      const entries = worktreeOutput.split("\n\n");

      for (const entry of entries) {
        const lines = entry.trim().split("\n");
        let wtPath: string | null = null;
        let wtBranch: string | null = null;

        for (const line of lines) {
          if (line.startsWith("worktree ")) {
            wtPath = line.slice("worktree ".length);
          }
          if (line.startsWith("branch ")) {
            wtBranch = line.slice("branch ".length);
          }
        }

        if (wtPath && wtBranch) {
          map.set(wtBranch, wtPath);
          // refs/heads/ を除いた名前でも引けるように
          if (wtBranch.startsWith("refs/heads/")) {
            map.set(wtBranch.slice("refs/heads/".length), wtPath);
          }
        }
      }
    } catch {
      // worktree list に失敗しても空のマップを返す
    }

    return map;
  }

  /** 指定ブランチに対応する worktree を削除する */
  private async removeWorktreeForBranch(branchName: string): Promise<void> {
    const worktreeMap = await this.getWorktreeMap();
    const fullRef = `refs/heads/${branchName}`;
    const worktreePath = worktreeMap.get(fullRef) ?? worktreeMap.get(branchName);

    if (worktreePath) {
      try {
        await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
      } catch {
        // worktree remove が失敗した場合、prune で掃除
        const { rm } = await import("node:fs/promises");
        await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
        await this.git.raw(["worktree", "prune"]);
      }
    }
  }
}
