/**
 * Repertoire Adapter
 * GitHubリポジトリからテンプレートパッケージをインストール・管理する。
 */

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  ensureDir,
  dirExists,
  remove,
  listFiles,
} from "../../infrastructure/fs/file-system.js";
import {
  type Repertoire,
  createRepertoire,
} from "../../domain/models/repertoire.model.js";

const REPERTOIRE_DIR = "repertoire";
const REPERTOIRE_MANIFEST = "repertoire.yaml";

export class RepertoireAdapter {
  /**
   * URLがGitHub/GitLabリポジトリの安全な形式かを検証する。
   */
  private validateUrl(url: string): void {
    const allowedPatterns = [
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/,
      /^https:\/\/gitlab\.com\/[\w.-]+\/[\w.-]+(\.git)?$/,
    ];
    const isValid = allowedPatterns.some((p) => p.test(url));
    if (!isValid) {
      throw new Error(
        `Invalid repository URL: ${url}\nOnly https://github.com/ and https://gitlab.com/ URLs are allowed.`,
      );
    }
  }

  /**
   * GitHubリポジトリを clone して .atelier/repertoire/<name>/ に配置する。
   */
  async install(
    url: string,
    projectPath: string,
  ): Promise<Repertoire> {
    this.validateUrl(url);
    const name = this.extractRepoName(url);
    const atelierPath = resolveAtelierPath(projectPath);
    const repertoireBase = path.join(atelierPath, REPERTOIRE_DIR);
    const targetDir = path.join(repertoireBase, name);

    await ensureDir(repertoireBase);

    // 既存があれば削除
    if (await dirExists(targetDir)) {
      await remove(targetDir);
    }

    // git clone --depth 1
    await execa("git", ["clone", "--depth", "1", url, targetDir]);

    // .git ディレクトリを削除（クリーンアップ）
    const gitDir = path.join(targetDir, ".git");
    if (await dirExists(gitDir)) {
      await remove(gitDir);
    }

    const repertoire = createRepertoire({
      name,
      source: url,
      version: "latest",
    });

    // マニフェストに記録
    await this.saveToManifest(repertoire, atelierPath);

    return repertoire;
  }

  /**
   * インストール済み Repertoire の一覧を返す。
   */
  async list(projectPath: string): Promise<readonly Repertoire[]> {
    const atelierPath = resolveAtelierPath(projectPath);
    const manifest = await this.loadManifest(atelierPath);
    return manifest;
  }

  /**
   * 指定した Repertoire を削除する。
   */
  async remove(name: string, projectPath: string): Promise<void> {
    const atelierPath = resolveAtelierPath(projectPath);
    const targetDir = path.join(atelierPath, REPERTOIRE_DIR, name);

    if (await dirExists(targetDir)) {
      await remove(targetDir);
    }

    await this.removeFromManifest(name, atelierPath);
  }

  /**
   * GitHub URL からリポジトリ名を抽出する。
   */
  private extractRepoName(url: string): string {
    const cleaned = url.replace(/\.git$/, "").replace(/\/$/, "");
    const parts = cleaned.split("/");
    return parts[parts.length - 1] ?? "unknown";
  }

  /**
   * マニフェストファイルを読み込む。
   */
  private async loadManifest(atelierPath: string): Promise<Repertoire[]> {
    const manifestPath = path.join(
      atelierPath,
      REPERTOIRE_DIR,
      REPERTOIRE_MANIFEST,
    );
    try {
      const content = await readFile(manifestPath, "utf-8");
      const parsed = parseYaml(content) as {
        repertoires?: Array<{
          name: string;
          source: string;
          version: string;
          installedAt: string;
        }>;
      };
      return (parsed.repertoires ?? []).map((r) => createRepertoire(r));
    } catch {
      return [];
    }
  }

  /**
   * マニフェストファイルに Repertoire を追加する。
   */
  private async saveToManifest(
    repertoire: Repertoire,
    atelierPath: string,
  ): Promise<void> {
    const existing = await this.loadManifest(atelierPath);
    const filtered = existing.filter((r) => r.name !== repertoire.name);
    filtered.push(repertoire);

    const manifestPath = path.join(
      atelierPath,
      REPERTOIRE_DIR,
      REPERTOIRE_MANIFEST,
    );
    await ensureDir(path.dirname(manifestPath));
    const content = stringifyYaml({ repertoires: filtered });
    await writeFile(manifestPath, content, "utf-8");
  }

  /**
   * マニフェストファイルから Repertoire を削除する。
   */
  private async removeFromManifest(
    name: string,
    atelierPath: string,
  ): Promise<void> {
    const existing = await this.loadManifest(atelierPath);
    const filtered = existing.filter((r) => r.name !== name);

    const manifestPath = path.join(
      atelierPath,
      REPERTOIRE_DIR,
      REPERTOIRE_MANIFEST,
    );
    await ensureDir(path.dirname(manifestPath));
    const content = stringifyYaml({ repertoires: filtered });
    await writeFile(manifestPath, content, "utf-8");
  }
}
