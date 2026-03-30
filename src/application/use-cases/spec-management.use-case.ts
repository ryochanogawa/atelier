/**
 * SpecManagement Use Case
 * 仕様書（Spec）の作成・一覧・詳細・フェーズ管理を行う。
 * AI呼び出しはCLI層に委譲し、このUseCaseはファイル操作とフェーズ検証のみ担う。
 */

import path from "node:path";
import {
  ensureDir,
  fileExists,
  dirExists,
  readTextFile,
  writeTextFile,
  listDirs,
  listFiles,
} from "../../infrastructure/fs/file-system.js";
import { resolveAtelierPath, timestamp } from "../../shared/utils.js";

/** Spec の永続データ */
export interface SpecJson {
  id: string;           // "001"
  name: string;         // "user-auth"
  description: string;  // "ユーザー認証機能"
  phase: "requirements" | "design" | "tasks" | "ready" | "implemented";
  created_at: string;   // ISO 8601
  updated_at: string;
}

/** Spec 一覧表示用サマリー */
export interface SpecSummary {
  id: string;
  name: string;
  phase: string;
  updated_at: string;
}

/** specs ディレクトリ名 */
const SPECS_DIR = "specs";

/** spec.json ファイル名 */
const SPEC_JSON_FILE = "spec.json";

/** requirements.md ファイル名 */
const REQUIREMENTS_FILE = "requirements.md";

/** design.md ファイル名 */
const DESIGN_FILE = "design.md";

/** tasks.md ファイル名 */
const TASKS_FILE = "tasks.md";

export class SpecManagementUseCase {
  constructor(private readonly projectPath: string) {}

  /**
   * 新規 spec を作成する。
   * 連番IDを自動採番し、.atelier/specs/{NNN}-{slug}/ ディレクトリと spec.json を生成する。
   * descriptionから slug を生成（英数字とハイフンのみ残す）。
   */
  async create(description: string): Promise<{ id: string; path: string }> {
    const specsDir = this.getSpecsDir();
    await ensureDir(specsDir);

    const id = await this.getNextId();
    const slug = this.generateSlug(description);
    const dirName = `${id}-${slug}`;
    const specDirPath = path.join(specsDir, dirName);

    await ensureDir(specDirPath);

    const now = timestamp();
    const specJson: SpecJson = {
      id,
      name: slug,
      description,
      phase: "requirements",
      created_at: now,
      updated_at: now,
    };

    const specJsonPath = path.join(specDirPath, SPEC_JSON_FILE);
    await writeTextFile(specJsonPath, JSON.stringify(specJson, null, 2));

    return { id, path: specDirPath };
  }

  /**
   * 設計書生成の前処理。
   * requirements.md の存在を確認し、phase を "design" に更新する。
   * 実際のAI呼び出しはCLI層で行う。
   * @returns specDirPath 設計書を配置するディレクトリパス
   */
  async generateDesign(specId: string): Promise<string> {
    const specDir = await this.resolveSpecDir(specId);
    if (!specDir) {
      throw new Error(`Spec ID '${specId}' が見つかりません`);
    }

    const requirementsPath = path.join(specDir, REQUIREMENTS_FILE);
    if (!(await fileExists(requirementsPath))) {
      throw new Error(
        `requirements.md が存在しません: ${requirementsPath}\n` +
          "設計書生成の前に要件定義書を作成してください。",
      );
    }

    await this.updatePhase(specDir, "design");

    return specDir;
  }

  /**
   * タスク書生成の前処理。
   * requirements.md と design.md の存在を確認し、phase を "tasks" に更新する。
   * 実際のAI呼び出しはCLI層で行う。
   * @returns specDirPath タスク書を配置するディレクトリパス
   */
  async generateTasks(specId: string): Promise<string> {
    const specDir = await this.resolveSpecDir(specId);
    if (!specDir) {
      throw new Error(`Spec ID '${specId}' が見つかりません`);
    }

    const requirementsPath = path.join(specDir, REQUIREMENTS_FILE);
    if (!(await fileExists(requirementsPath))) {
      throw new Error(
        `requirements.md が存在しません: ${requirementsPath}\n` +
          "タスク書生成の前に要件定義書を作成してください。",
      );
    }

    const designPath = path.join(specDir, DESIGN_FILE);
    if (!(await fileExists(designPath))) {
      throw new Error(
        `design.md が存在しません: ${designPath}\n` +
          "タスク書生成の前に設計書を作成してください。",
      );
    }

    await this.updatePhase(specDir, "tasks");

    return specDir;
  }

  /**
   * 仕様書の一覧を返す。
   */
  async list(): Promise<SpecSummary[]> {
    const specsDir = this.getSpecsDir();

    if (!(await dirExists(specsDir))) {
      return [];
    }

    const dirNames = await listDirs(specsDir);
    const summaries: SpecSummary[] = [];

    for (const dirName of dirNames) {
      const specJsonPath = path.join(specsDir, dirName, SPEC_JSON_FILE);
      if (!(await fileExists(specJsonPath))) {
        continue;
      }

      try {
        const content = await readTextFile(specJsonPath);
        const specJson = JSON.parse(content) as SpecJson;
        summaries.push({
          id: specJson.id,
          name: specJson.name,
          phase: specJson.phase,
          updated_at: specJson.updated_at,
        });
      } catch {
        // 読み込み・パース失敗のエントリはスキップ
      }
    }

    // IDの昇順でソート
    summaries.sort((a, b) => a.id.localeCompare(b.id));

    return summaries;
  }

  /**
   * 仕様書の詳細と含まれるファイル一覧を返す。
   */
  async show(specId: string): Promise<{ spec: SpecJson; files: string[] }> {
    const specDir = await this.resolveSpecDir(specId);
    if (!specDir) {
      throw new Error(`Spec ID '${specId}' が見つかりません`);
    }

    const specJsonPath = path.join(specDir, SPEC_JSON_FILE);
    const content = await readTextFile(specJsonPath);
    const spec = JSON.parse(content) as SpecJson;

    const allFiles = await listFiles(specDir);
    const files = allFiles.map((f) => path.basename(f));

    return { spec, files };
  }

  /**
   * specs ディレクトリの絶対パスを返す。
   */
  private getSpecsDir(): string {
    return path.join(resolveAtelierPath(this.projectPath), SPECS_DIR);
  }

  /**
   * 次の連番 ID（3桁ゼロパディング）を取得する。
   * 既存ディレクトリのプレフィックスから最大値を求めて +1 する。
   */
  private async getNextId(): Promise<string> {
    const specsDir = this.getSpecsDir();

    if (!(await dirExists(specsDir))) {
      return "001";
    }

    const dirNames = await listDirs(specsDir);
    let maxId = 0;

    for (const dirName of dirNames) {
      // ディレクトリ名は "{NNN}-{slug}" 形式
      const match = /^(\d{3})-/.exec(dirName);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) {
          maxId = num;
        }
      }
    }

    return String(maxId + 1).padStart(3, "0");
  }

  /**
   * specId からディレクトリパスを解決する。
   * 存在しない場合は null を返す。
   */
  private async resolveSpecDir(specId: string): Promise<string | null> {
    const specsDir = this.getSpecsDir();

    if (!(await dirExists(specsDir))) {
      return null;
    }

    const dirNames = await listDirs(specsDir);

    for (const dirName of dirNames) {
      // "{NNN}-{slug}" 形式でプレフィックスが specId と一致するか確認
      if (dirName.startsWith(`${specId}-`) || dirName === specId) {
        const fullPath = path.join(specsDir, dirName);
        const specJsonPath = path.join(fullPath, SPEC_JSON_FILE);
        if (await fileExists(specJsonPath)) {
          return fullPath;
        }
      }
    }

    return null;
  }

  /**
   * description から slug を生成する。
   * 英数字・ハイフン・アンダースコアのみ残し、スペースはハイフンに変換する。
   * 日本語などの非ASCII文字は除去する。
   */
  private generateSlug(description: string): string {
    const slug = description
      .toLowerCase()
      .replace(/\s+/g, "-")          // スペース → ハイフン
      .replace(/[^a-z0-9\-_]/g, "")  // 英数字・ハイフン・アンダースコア以外を除去
      .replace(/-{2,}/g, "-")        // 連続ハイフンを1つに
      .replace(/^-+|-+$/g, "");      // 先頭・末尾のハイフンを除去

    // slug が空になった場合はデフォルト名を使用
    return slug || "spec";
  }

  /**
   * spec.json の phase を更新する。
   */
  private async updatePhase(
    specDir: string,
    phase: SpecJson["phase"],
  ): Promise<void> {
    const specJsonPath = path.join(specDir, SPEC_JSON_FILE);
    const content = await readTextFile(specJsonPath);
    const specJson = JSON.parse(content) as SpecJson;

    specJson.phase = phase;
    specJson.updated_at = timestamp();

    await writeTextFile(specJsonPath, JSON.stringify(specJson, null, 2));
  }
}
