/**
 * Requirements Store Adapter
 * .atelier/requirements/ に要件定義書をYAMLファイルとして永続化する。
 */

import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { resolveAtelierPath } from "../../shared/utils.js";
import { REQUIREMENTS_DIR } from "../../shared/constants.js";
import {
  writeTextFile,
  listFiles,
  readTextFile,
} from "../../infrastructure/fs/file-system.js";
import type {
  RequirementsDocument,
  Contradiction,
  Gap,
  Checklist,
} from "../../domain/value-objects/requirements.vo.js";

/** 保存時のフル分析結果 */
export interface RequirementsReport {
  readonly document: RequirementsDocument;
  readonly contradictions: Contradiction[];
  readonly gaps: Gap[];
  readonly checklist: Checklist;
}

export class RequirementsStoreAdapter {
  private readonly dirPath: string;

  constructor(projectPath: string) {
    this.dirPath = path.join(
      resolveAtelierPath(projectPath),
      REQUIREMENTS_DIR,
    );
  }

  /** 要件定義書を保存し、ファイルパスを返す */
  async save(report: RequirementsReport): Promise<string> {
    const filename = this.generateFilename(report.document.title);
    const filePath = path.join(this.dirPath, filename);

    const data = {
      title: report.document.title,
      created_at: new Date().toISOString(),
      functional: report.document.functional.map((r) => ({
        id: r.id,
        description: r.description,
        priority: r.priority,
        category: r.category,
        acceptance_criteria: r.acceptanceCriteria,
      })),
      non_functional: report.document.nonFunctional.map((r) => ({
        id: r.id,
        description: r.description,
        priority: r.priority,
        category: r.category,
        acceptance_criteria: r.acceptanceCriteria,
      })),
      assumptions: report.document.assumptions,
      open_questions: report.document.openQuestions,
      contradictions: report.contradictions.map((c) => ({
        requirement_ids: c.requirementIds,
        reason: c.reason,
        severity: c.severity,
      })),
      gaps: report.gaps.map((g) => ({
        category: g.category,
        description: g.description,
        suggestion: g.suggestion,
      })),
      checklist: report.checklist.items.map((item) => ({
        question: item.question,
        category: item.category,
        required: item.required,
      })),
    };

    const content = stringifyYaml(data, { indent: 2 });
    await writeTextFile(filePath, content);
    return filePath;
  }

  /** 保存済みの要件定義書一覧を取得する */
  async list(): Promise<string[]> {
    return listFiles(this.dirPath, ".yaml");
  }

  private generateFilename(title: string): string {
    const date = new Date().toISOString().slice(0, 10);
    const slug = title
      .replace(/[^\w\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `${date}_${slug || "requirements"}.yaml`;
  }
}
