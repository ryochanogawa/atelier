/**
 * ValidateCommission Use Case
 * Commission YAML の構文・スキーマ検証。
 */

import path from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveAtelierPath } from "../../shared/utils.js";
import { COMMISSIONS_DIR } from "../../shared/constants.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";

export interface ValidationResult {
  readonly valid: boolean;
  readonly commissionName: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export class CommissionValidateUseCase {
  async execute(
    commissionName: string,
    projectPath: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const atelierPath = resolveAtelierPath(projectPath);
    const commissionPath = path.join(
      atelierPath,
      COMMISSIONS_DIR,
      `${commissionName}.yaml`,
    );

    // ファイル存在チェック
    if (!(await fileExists(commissionPath))) {
      return {
        valid: false,
        commissionName,
        errors: [`Commission ファイルが見つかりません: ${commissionPath}`],
        warnings: [],
      };
    }

    // YAML パース
    let parsed: Record<string, unknown>;
    try {
      const content = await readTextFile(commissionPath);
      parsed = parseYaml(content) as Record<string, unknown>;
    } catch (error) {
      return {
        valid: false,
        commissionName,
        errors: [
          `YAML パースエラー: ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: [],
      };
    }

    // スキーマ検証
    if (!parsed || typeof parsed !== "object") {
      errors.push("YAML のルート要素はオブジェクトである必要があります");
      return { valid: false, commissionName, errors, warnings };
    }

    if (!parsed.name || typeof parsed.name !== "string") {
      errors.push("'name' フィールドは必須です（文字列）");
    }

    if (!parsed.description || typeof parsed.description !== "string") {
      warnings.push("'description' フィールドが未設定です");
    }

    if (!Array.isArray(parsed.strokes)) {
      errors.push("'strokes' フィールドは必須です（配列）");
    } else {
      const strokeNames = new Set<string>();

      for (let i = 0; i < parsed.strokes.length; i++) {
        const stroke = parsed.strokes[i] as Record<string, unknown>;
        const prefix = `strokes[${i}]`;

        if (!stroke.name || typeof stroke.name !== "string") {
          errors.push(`${prefix}: 'name' は必須です`);
        } else {
          if (strokeNames.has(stroke.name)) {
            errors.push(
              `${prefix}: Stroke 名 '${stroke.name}' が重複しています`,
            );
          }
          strokeNames.add(stroke.name);
        }

        // parallel ストロークの場合は palette/instruction はサブストロークに定義される
        const isParallelStroke = Array.isArray(stroke.parallel) && stroke.parallel.length > 0;

        if (!isParallelStroke) {
          if (!stroke.palette || typeof stroke.palette !== "string") {
            errors.push(`${prefix}: 'palette' は必須です`);
          }

          if (!stroke.instruction || typeof stroke.instruction !== "string") {
            errors.push(`${prefix}: 'instruction' は必須です`);
          }
        } else {
          // parallel サブストロークの検証
          const parallelSubs = stroke.parallel as Record<string, unknown>[];
          for (let k = 0; k < parallelSubs.length; k++) {
            const sub = parallelSubs[k];
            const subPrefix = `${prefix}.parallel[${k}]`;
            if (!sub.name || typeof sub.name !== "string") {
              errors.push(`${subPrefix}: 'name' は必須です`);
            }
            if (!sub.palette || typeof sub.palette !== "string") {
              errors.push(`${subPrefix}: 'palette' は必須です`);
            }
            if (!sub.instruction || typeof sub.instruction !== "string") {
              errors.push(`${subPrefix}: 'instruction' は必須です`);
            }
          }
        }

        if (stroke.transitions && Array.isArray(stroke.transitions)) {
          for (let j = 0; j < stroke.transitions.length; j++) {
            const transition = stroke.transitions[j] as Record<string, unknown>;
            if (!transition.next || typeof transition.next !== "string") {
              errors.push(
                `${prefix}.transitions[${j}]: 'next' は必須です`,
              );
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      commissionName,
      errors,
      warnings,
    };
  }
}
