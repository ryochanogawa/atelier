/**
 * Requirements Store Adapter
 * .atelier/requirements/{id}/requirements.md に要件定義書を永続化する。
 * 連番IDフォルダ方式で管理する。
 */

import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { resolveAtelierPath } from "../../shared/utils.js";
import { REQUIREMENTS_DIR } from "../../shared/constants.js";
import {
  writeTextFile,
  listDirs,
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

  /** 要件定義書を連番IDフォルダに保存し、IDを返す */
  async save(report: RequirementsReport): Promise<number> {
    const nextId = await this.getNextId();
    const filePath = path.join(this.dirPath, String(nextId), "requirements.md");

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
    return nextId;
  }

  /** 次の連番IDを計算する */
  private async getNextId(): Promise<number> {
    const dirs = await listDirs(this.dirPath);
    const numericDirs = dirs
      .map((d) => parseInt(d, 10))
      .filter((n) => !isNaN(n));
    return numericDirs.length > 0 ? Math.max(...numericDirs) + 1 : 1;
  }
}
