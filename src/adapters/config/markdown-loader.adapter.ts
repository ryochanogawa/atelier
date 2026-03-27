/**
 * Markdown Loader アダプター
 * .md ファイルを読み込み、frontmatter からメタデータを抽出して Palette に変換する。
 */

import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";

export interface MarkdownPaletteData {
  readonly name: string;
  readonly description: string;
  readonly persona: string;
  readonly policies: readonly string[];
  readonly defaults: {
    readonly temperature?: number;
    readonly max_tokens?: number;
    readonly model?: string;
  };
}

/**
 * Markdown ファイルの frontmatter と本文を分離する。
 */
function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: {},
      body: content.trim(),
    };
  }

  const rawMeta = match[1] ?? "";
  const body = match[2] ?? "";

  let metadata: Record<string, unknown>;
  try {
    metadata = (parseYaml(rawMeta) as Record<string, unknown>) ?? {};
  } catch {
    metadata = {};
  }

  return { metadata, body: body.trim() };
}

export class MarkdownLoaderAdapter {
  /**
   * .md ファイルを読み込んで MarkdownPaletteData に変換する。
   */
  async loadMarkdownPalette(filePath: string): Promise<MarkdownPaletteData> {
    const content = await readFile(filePath, "utf-8");
    return this.parseMarkdownPalette(content, filePath);
  }

  /**
   * ディレクトリパスと名前から .md ファイルを読み込む。
   */
  async loadPaletteByName(
    name: string,
    projectPath: string,
  ): Promise<MarkdownPaletteData> {
    const filePath = join(projectPath, ".atelier", "palettes", `${name}.md`);
    return this.loadMarkdownPalette(filePath);
  }

  /**
   * Markdown 文字列をパースして MarkdownPaletteData を生成する。
   */
  parseMarkdownPalette(
    content: string,
    filePath?: string,
  ): MarkdownPaletteData {
    const { metadata, body } = parseFrontmatter(content);

    const fileName = filePath
      ? basename(filePath, ".md")
      : "unknown";

    const name = (metadata.name as string) ?? fileName;
    const description =
      (metadata.description as string) ?? "";
    const policies = Array.isArray(metadata.policies)
      ? (metadata.policies as string[])
      : [];
    const defaults = (metadata.defaults as Record<string, unknown>) ?? {};

    return Object.freeze({
      name,
      description,
      persona: body,
      policies: Object.freeze([...policies]),
      defaults: Object.freeze({
        temperature: defaults.temperature as number | undefined,
        max_tokens: defaults.max_tokens as number | undefined,
        model: defaults.model as string | undefined,
      }),
    });
  }
}
