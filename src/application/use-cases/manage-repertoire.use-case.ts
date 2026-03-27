/**
 * ManageRepertoire Use Case
 * Repertoire パッケージの install / list / remove を行う。
 */

import { RepertoireAdapter } from "../../adapters/plugin/repertoire.adapter.js";
import type { Repertoire } from "../../domain/models/repertoire.model.js";

export class ManageRepertoireUseCase {
  private readonly adapter: RepertoireAdapter;

  constructor(adapter?: RepertoireAdapter) {
    this.adapter = adapter ?? new RepertoireAdapter();
  }

  /**
   * GitHub URL から Repertoire をインストールする。
   */
  async install(url: string, projectPath: string): Promise<Repertoire> {
    if (!url.trim()) {
      throw new Error("Repertoire URL を指定してください");
    }
    return this.adapter.install(url, projectPath);
  }

  /**
   * インストール済み Repertoire の一覧を返す。
   */
  async list(projectPath: string): Promise<readonly Repertoire[]> {
    return this.adapter.list(projectPath);
  }

  /**
   * 指定した Repertoire を削除する。
   */
  async remove(name: string, projectPath: string): Promise<void> {
    if (!name.trim()) {
      throw new Error("Repertoire 名を指定してください");
    }
    return this.adapter.remove(name, projectPath);
  }
}
