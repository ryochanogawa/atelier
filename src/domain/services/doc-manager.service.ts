/**
 * DocManagerService Domain Service
 * ドキュメント自動管理のためのサービス。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import type {
  StaleDocument,
  KnowledgeEntry,
  DocGenerationResult,
} from "../value-objects/documentation.vo.js";

/** 無視するディレクトリ */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".atelier",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  "target",
]);

/** ドキュメント拡張子 */
const DOC_EXTENSIONS = new Set([".md", ".txt", ".rst", ".adoc"]);

/** ソースコード拡張子 */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".cs",
  ".c",
  ".cpp",
  ".h",
]);

export class DocManagerService {
  /**
   * 陳腐化したドキュメントを検出する。
   */
  async detectStaleDocuments(workingDir: string): Promise<StaleDocument[]> {
    const docFiles: string[] = [];
    const sourceFiles: string[] = [];

    // ファイル走査
    await this.walkDir(workingDir, (filePath, ext) => {
      if (DOC_EXTENSIONS.has(ext)) {
        docFiles.push(filePath);
      } else if (SOURCE_EXTENSIONS.has(ext)) {
        sourceFiles.push(filePath);
      }
    });

    const results: StaleDocument[] = [];

    for (const docPath of docFiles) {
      const docStat = await fs.stat(docPath);
      const docModified = docStat.mtime;

      // 関連するソースファイルを推定（同名ディレクトリ or 同名ファイル）
      const docBaseName = path.basename(docPath, path.extname(docPath));
      const docDir = path.dirname(docPath);
      const relatedSources = sourceFiles.filter((sf) => {
        const sfBaseName = path.basename(sf, path.extname(sf));
        const sfDir = path.dirname(sf);
        // 同名ファイル or 同ディレクトリ内のソースファイル
        return (
          sfBaseName.toLowerCase() === docBaseName.toLowerCase() ||
          sfDir === docDir ||
          sfDir.startsWith(docDir)
        );
      });

      // 関連ソースの最新更新日を取得
      let latestSourceModified = new Date(0);
      for (const sf of relatedSources) {
        try {
          const sfStat = await fs.stat(sf);
          if (sfStat.mtime > latestSourceModified) {
            latestSourceModified = sfStat.mtime;
          }
        } catch {
          // ファイルが消えた場合は無視
        }
      }

      // ソースが見つからない場合はドキュメント自身の日時で判定
      if (relatedSources.length === 0) {
        latestSourceModified = docModified;
      }

      // 鮮度スコアと状態を計算
      const daysDiff = Math.max(
        0,
        Math.floor(
          (latestSourceModified.getTime() - docModified.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      const { score, status } = this.calculateFreshness(daysDiff);

      results.push({
        filePath: path.relative(workingDir, docPath),
        lastModified: docModified,
        relatedSourceFiles: relatedSources.map((sf) =>
          path.relative(workingDir, sf),
        ),
        sourceLastModified: latestSourceModified,
        freshnessScore: score,
        status,
      });
    }

    // 鮮度スコア昇順（最も古いものが先頭）
    return results.sort((a, b) => a.freshnessScore - b.freshnessScore);
  }

  /**
   * ソースコードからドキュメントスケルトンを生成する。
   */
  async generateDocFromCode(
    filePath: string,
    content: string,
  ): Promise<DocGenerationResult> {
    const lines = content.split("\n");
    const sections: string[] = [];
    const docParts: string[] = [];
    const baseName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    // ヘッダー
    docParts.push(`# ${baseName}`);
    docParts.push("");
    sections.push("Header");

    // ファイル概要（先頭のJSDoc/コメントブロックから抽出）
    const fileDescription = this.extractFileDescription(lines);
    if (fileDescription) {
      docParts.push("## Overview");
      docParts.push("");
      docParts.push(fileDescription);
      docParts.push("");
      sections.push("Overview");
    }

    // エクスポートされたインターフェース・型
    const interfaces = this.extractInterfaces(lines);
    if (interfaces.length > 0) {
      docParts.push("## Interfaces / Types");
      docParts.push("");
      for (const iface of interfaces) {
        docParts.push(`### ${iface.name}`);
        docParts.push("");
        if (iface.description) {
          docParts.push(iface.description);
          docParts.push("");
        }
        docParts.push("```" + ext.slice(1));
        docParts.push(iface.signature);
        docParts.push("```");
        docParts.push("");
      }
      sections.push("Interfaces");
    }

    // エクスポートされた関数
    const functions = this.extractFunctions(lines);
    if (functions.length > 0) {
      docParts.push("## Functions");
      docParts.push("");
      for (const fn of functions) {
        docParts.push(`### ${fn.name}`);
        docParts.push("");
        if (fn.description) {
          docParts.push(fn.description);
          docParts.push("");
        }
        docParts.push("```" + ext.slice(1));
        docParts.push(fn.signature);
        docParts.push("```");
        docParts.push("");
      }
      sections.push("Functions");
    }

    // エクスポートされたクラス
    const classes = this.extractClasses(lines);
    if (classes.length > 0) {
      docParts.push("## Classes");
      docParts.push("");
      for (const cls of classes) {
        docParts.push(`### ${cls.name}`);
        docParts.push("");
        if (cls.description) {
          docParts.push(cls.description);
          docParts.push("");
        }
        if (cls.methods.length > 0) {
          docParts.push("#### Methods");
          docParts.push("");
          for (const method of cls.methods) {
            docParts.push(`- \`${method}\``);
          }
          docParts.push("");
        }
      }
      sections.push("Classes");
    }

    // Usage セクション（スケルトン）
    docParts.push("## Usage");
    docParts.push("");
    docParts.push("```" + ext.slice(1));
    docParts.push(`import { /* ... */ } from './${baseName}${ext}';`);
    docParts.push("");
    docParts.push("// TODO: 使用例を追加");
    docParts.push("```");
    docParts.push("");
    sections.push("Usage");

    return {
      filePath,
      content: docParts.join("\n"),
      sections,
    };
  }

  /**
   * ナレッジ情報を収集する。
   */
  async collectKnowledge(workingDir: string): Promise<KnowledgeEntry[]> {
    const entries: KnowledgeEntry[] = [];
    const now = new Date();

    // git log からコミットメッセージを収集
    try {
      const git = simpleGit(workingDir);
      const log = await git.log({ maxCount: 50, "--oneline": null });
      for (const commit of log.all) {
        entries.push({
          source: "commit",
          content: commit.message,
          date: new Date(commit.date),
          relevance: this.calculateRelevance(
            new Date(commit.date),
            now,
            "commit",
          ),
        });
      }
    } catch {
      // git が利用できない場合は無視
    }

    // TODO/FIXME コメントを収集
    const sourceFiles: string[] = [];
    await this.walkDir(workingDir, (filePath, ext) => {
      if (SOURCE_EXTENSIONS.has(ext)) {
        sourceFiles.push(filePath);
      }
    });

    const todoPattern =
      /(?:\/\/|\/\*|#)\s*(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)/i;
    for (const sf of sourceFiles) {
      try {
        const content = await fs.readFile(sf, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const match = todoPattern.exec(line);
          if (match) {
            const sfStat = await fs.stat(sf);
            entries.push({
              source: "comment",
              content: `${match[1].toUpperCase()}: ${match[2].trim()}`,
              filePath: path.relative(workingDir, sf),
              date: sfStat.mtime,
              relevance: 70,
            });
          }
        }
      } catch {
        // 読めないファイルは無視
      }
    }

    // 既存ドキュメントの一覧
    const docFiles: string[] = [];
    await this.walkDir(workingDir, (filePath, ext) => {
      if (DOC_EXTENSIONS.has(ext)) {
        docFiles.push(filePath);
      }
    });

    for (const df of docFiles) {
      try {
        const dfStat = await fs.stat(df);
        const relativePath = path.relative(workingDir, df);
        entries.push({
          source: "document",
          content: `Document: ${relativePath}`,
          filePath: relativePath,
          date: dfStat.mtime,
          relevance: this.calculateRelevance(dfStat.mtime, now, "document"),
        });
      } catch {
        // 読めないファイルは無視
      }
    }

    // relevance 降順でソート
    return entries.sort((a, b) => b.relevance - a.relevance);
  }

  // ─── Private helpers ───────────────────────────

  /**
   * ディレクトリを再帰的に走査する。
   */
  private async walkDir(
    dir: string,
    callback: (filePath: string, ext: string) => void,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await this.walkDir(fullPath, callback);
        }
        continue;
      }

      if (entry.isFile()) {
        callback(fullPath, path.extname(entry.name).toLowerCase());
      }
    }
  }

  /**
   * 鮮度スコアとステータスを計算する。
   */
  private calculateFreshness(daysDiff: number): {
    score: number;
    status: "fresh" | "aging" | "stale" | "obsolete";
  } {
    if (daysDiff <= 7) {
      return { score: Math.round(100 - daysDiff * (30 / 7)), status: "fresh" };
    }
    if (daysDiff <= 30) {
      return {
        score: Math.round(70 - ((daysDiff - 7) * 30) / 23),
        status: "aging",
      };
    }
    if (daysDiff <= 90) {
      return {
        score: Math.round(40 - ((daysDiff - 30) * 30) / 60),
        status: "stale",
      };
    }
    return { score: Math.max(0, Math.round(10 - (daysDiff - 90) / 30)), status: "obsolete" };
  }

  /**
   * relevance スコアを計算する。
   */
  private calculateRelevance(
    date: Date,
    now: Date,
    source: string,
  ): number {
    const daysDiff = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    let base = source === "commit" ? 80 : 60;
    // 新しいほど relevance が高い
    return Math.max(0, base - Math.floor(daysDiff / 7) * 5);
  }

  /**
   * ファイル先頭のコメントブロックからファイル概要を抽出する。
   */
  private extractFileDescription(lines: string[]): string | null {
    // /** ... */ パターン
    if (lines[0]?.trim().startsWith("/**")) {
      const descLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "*/") break;
        descLines.push(trimmed.replace(/^\*\s?/, ""));
      }
      return descLines.join("\n").trim() || null;
    }
    return null;
  }

  /**
   * エクスポートされたインターフェース/型を抽出する。
   */
  private extractInterfaces(
    lines: string[],
  ): Array<{ name: string; description: string | null; signature: string }> {
    const results: Array<{
      name: string;
      description: string | null;
      signature: string;
    }> = [];
    const pattern = /^export\s+(?:interface|type)\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i]);
      if (match) {
        const description = this.extractPrecedingComment(lines, i);
        results.push({
          name: match[1],
          description,
          signature: lines[i].trim(),
        });
      }
    }

    return results;
  }

  /**
   * エクスポートされた関数を抽出する。
   */
  private extractFunctions(
    lines: string[],
  ): Array<{ name: string; description: string | null; signature: string }> {
    const results: Array<{
      name: string;
      description: string | null;
      signature: string;
    }> = [];
    const pattern =
      /^export\s+(?:async\s+)?function\s+(\w+)|^export\s+(?:const|let)\s+(\w+)\s*=/;

    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i]);
      if (match) {
        const name = match[1] ?? match[2];
        const description = this.extractPrecedingComment(lines, i);
        results.push({
          name,
          description,
          signature: lines[i].trim(),
        });
      }
    }

    return results;
  }

  /**
   * エクスポートされたクラスを抽出する。
   */
  private extractClasses(
    lines: string[],
  ): Array<{
    name: string;
    description: string | null;
    methods: string[];
  }> {
    const results: Array<{
      name: string;
      description: string | null;
      methods: string[];
    }> = [];
    const classPattern =
      /^export\s+(?:abstract\s+)?class\s+(\w+)/;
    const methodPattern =
      /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)/;

    for (let i = 0; i < lines.length; i++) {
      const classMatch = classPattern.exec(lines[i]);
      if (classMatch) {
        const description = this.extractPrecedingComment(lines, i);
        const methods: string[] = [];

        // クラス内のメソッドを探す
        let braceCount = 0;
        let inClass = false;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes("{")) {
            braceCount += (lines[j].match(/\{/g) ?? []).length;
            inClass = true;
          }
          if (lines[j].includes("}")) {
            braceCount -= (lines[j].match(/\}/g) ?? []).length;
          }
          if (inClass && j > i) {
            const methodMatch = methodPattern.exec(lines[j]);
            if (
              methodMatch &&
              methodMatch[1] !== "constructor" &&
              !lines[j].trim().startsWith("//") &&
              !lines[j].trim().startsWith("*")
            ) {
              methods.push(methodMatch[1]);
            }
          }
          if (inClass && braceCount === 0) break;
        }

        results.push({ name: classMatch[1], description, methods });
      }
    }

    return results;
  }

  /**
   * 指定行の直前の JSDoc コメントを抽出する。
   */
  private extractPrecedingComment(
    lines: string[],
    lineIndex: number,
  ): string | null {
    if (lineIndex === 0) return null;
    const prevLine = lines[lineIndex - 1]?.trim();
    if (prevLine === "*/") {
      // 複数行 JSDoc を探す
      const descLines: string[] = [];
      for (let i = lineIndex - 2; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("/**")) break;
        descLines.unshift(trimmed.replace(/^\*\s?/, ""));
      }
      return descLines.join(" ").trim() || null;
    }
    // 単行コメント
    if (prevLine?.startsWith("//")) {
      return prevLine.replace(/^\/\/\s?/, "").trim() || null;
    }
    return null;
  }
}
