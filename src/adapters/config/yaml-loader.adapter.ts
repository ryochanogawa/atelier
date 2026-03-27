/**
 * YAML Config Loader アダプター
 * yaml パッケージでYAMLファイルを読み込み、Zodスキーマでバリデーションする。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { StudioConfigSchema, type StudioConfig } from "./schemas/studio.schema.js";
import { CommissionSchema } from "./schemas/commission.schema.js";
import { PaletteSchema } from "./schemas/palette.schema.js";
import { MarkdownLoaderAdapter, type MarkdownPaletteData } from "./markdown-loader.adapter.js";
import type { ConfigPort } from "./types.js";

const ATELIER_DIR = ".atelier";

export class YamlLoaderAdapter implements ConfigPort {
  private readonly markdownLoader = new MarkdownLoaderAdapter();

  /**
   * .atelier/studio.yaml を読み込み、StudioConfig としてパースする。
   */
  async loadStudioConfig(projectPath: string): Promise<StudioConfig> {
    const filePath = join(projectPath, ATELIER_DIR, "studio.yaml");
    const raw = await this.readYaml(filePath);
    return StudioConfigSchema.parse(raw);
  }

  /**
   * .atelier/commissions/<name>.yaml を読み込む。
   */
  async loadCommission(name: string, projectPath: string): Promise<unknown> {
    const filePath = join(
      projectPath,
      ATELIER_DIR,
      "commissions",
      `${name}.yaml`,
    );
    const raw = await this.readYaml(filePath);
    return CommissionSchema.parse(raw);
  }

  /**
   * .atelier/palettes/<name>.yaml または <name>.md を読み込む。
   * .md ファイルが存在する場合はそちらを優先する。
   */
  async loadPalette(name: string, projectPath: string): Promise<unknown> {
    // まず .md ファイルを試みる
    const mdFilePath = join(
      projectPath,
      ATELIER_DIR,
      "palettes",
      `${name}.md`,
    );
    try {
      const mdData = await this.markdownLoader.loadMarkdownPalette(mdFilePath);
      return mdData;
    } catch {
      // .md が見つからない場合は .yaml にフォールバック
    }

    const filePath = join(
      projectPath,
      ATELIER_DIR,
      "palettes",
      `${name}.yaml`,
    );
    const raw = await this.readYaml(filePath);
    return PaletteSchema.parse(raw);
  }

  /**
   * .atelier/palettes/<name>.md を読み込んで MarkdownPaletteData を返す。
   */
  async loadMarkdownPalette(
    name: string,
    projectPath: string,
  ): Promise<MarkdownPaletteData> {
    return this.markdownLoader.loadPaletteByName(name, projectPath);
  }

  /**
   * .atelier/policies/<name>.yaml を読み込む。
   * ポリシーは自由形式のYAMLとして返す（スキーマバリデーションなし）。
   */
  async loadPolicy(name: string, projectPath: string): Promise<unknown> {
    const filePath = join(
      projectPath,
      ATELIER_DIR,
      "policies",
      `${name}.yaml`,
    );
    return this.readYaml(filePath);
  }

  private async readYaml(filePath: string): Promise<unknown> {
    try {
      const content = await readFile(filePath, "utf-8");
      return parseYaml(content);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new Error(`Configuration file not found: ${filePath}`);
      }
      throw error;
    }
  }
}
