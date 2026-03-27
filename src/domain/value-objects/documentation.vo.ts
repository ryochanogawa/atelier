/**
 * Documentation Value Objects
 * ドキュメント管理に関する値オブジェクト定義。
 */

export interface StaleDocument {
  readonly filePath: string;
  readonly lastModified: Date;
  readonly relatedSourceFiles: string[];
  readonly sourceLastModified: Date;
  readonly freshnessScore: number; // 0-100 (100=fresh)
  readonly status: "fresh" | "aging" | "stale" | "obsolete";
}

export interface KnowledgeEntry {
  readonly source: "commit" | "comment" | "document" | "issue";
  readonly content: string;
  readonly filePath?: string;
  readonly date: Date;
  readonly relevance: number; // 0-100
}

export interface DocGenerationResult {
  readonly filePath: string;
  readonly content: string;
  readonly sections: string[];
}
