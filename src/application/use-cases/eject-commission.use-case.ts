/**
 * EjectCommission Use Case
 * ビルトイン Commission をプロジェクトの .atelier/ にコピーして編集可能にする。
 */

import path from "node:path";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  COMMISSIONS_DIR,
  PALETTES_DIR,
  POLICIES_DIR,
  CONTRACTS_DIR,
  INSTRUCTIONS_DIR,
  KNOWLEDGE_DIR,
} from "../../shared/constants.js";
import {
  ensureDir,
  fileExists,
  copyFile,
} from "../../infrastructure/fs/file-system.js";
import {
  listBuiltinCommissions,
  getBuiltinCommission,
  getBuiltinCommissionPath,
  getBuiltinPalettePath,
  getBuiltinPolicyPath,
  getBuiltinContractPath,
  getBuiltinInstructionPath,
  getBuiltinKnowledgePath,
  listBuiltinPalettes,
  listBuiltinPolicies,
} from "../../builtin/index.js";

export interface EjectResult {
  readonly commissionName: string;
  readonly copiedFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}

export class EjectCommissionUseCase {
  /**
   * ビルトイン Commission をローカルにコピーする。
   * 関連する palette, policy, contract も一緒にコピーする。
   */
  async execute(
    commissionName: string,
    projectPath: string,
    options: { force?: boolean } = {},
  ): Promise<EjectResult> {
    const builtinNames = listBuiltinCommissions();
    if (!builtinNames.includes(commissionName)) {
      throw new Error(
        `ビルトイン Commission '${commissionName}' が見つかりません。利用可能: ${builtinNames.join(", ")}`,
      );
    }

    const atelierPath = resolveAtelierPath(projectPath);
    const copiedFiles: string[] = [];
    const skippedFiles: string[] = [];

    // Commission ファイルをコピー
    await this.copyBuiltinFile(
      getBuiltinCommissionPath(commissionName),
      path.join(atelierPath, COMMISSIONS_DIR, `${commissionName}.yaml`),
      copiedFiles,
      skippedFiles,
      options.force,
    );

    // Commission の YAML を読み込んで関連リソースを特定
    const commission = (await getBuiltinCommission(commissionName)) as Record<
      string,
      unknown
    >;
    const strokes = (commission.strokes ?? []) as Array<
      Record<string, unknown>
    >;

    // 関連 Palette をコピー
    const paletteNames = new Set<string>();
    for (const stroke of strokes) {
      if (typeof stroke.palette === "string") {
        paletteNames.add(stroke.palette);
      }
    }

    const builtinPalettes = listBuiltinPalettes();
    for (const paletteName of paletteNames) {
      if (builtinPalettes.includes(paletteName)) {
        await this.copyBuiltinFile(
          getBuiltinPalettePath(paletteName),
          path.join(atelierPath, PALETTES_DIR, `${paletteName}.yaml`),
          copiedFiles,
          skippedFiles,
          options.force,
        );

        // Palette の policies もコピー
        const builtinPolicies = listBuiltinPolicies();
        // Palette YAML を読んで policy を取得
        try {
          const { readFile } = await import("node:fs/promises");
          const { parse: parseYaml } = await import("yaml");
          const palettePath = getBuiltinPalettePath(paletteName);
          const paletteContent = await readFile(palettePath, "utf-8");
          const paletteData = parseYaml(paletteContent) as Record<
            string,
            unknown
          >;
          const policies = (paletteData.policies ?? []) as string[];
          for (const policyName of policies) {
            if (builtinPolicies.includes(policyName)) {
              await this.copyBuiltinFile(
                getBuiltinPolicyPath(policyName),
                path.join(atelierPath, POLICIES_DIR, `${policyName}.yaml`),
                copiedFiles,
                skippedFiles,
                options.force,
              );
            }
          }
        } catch {
          // Policy のコピーに失敗しても続行
        }
      }
    }

    // 関連 Instruction, Knowledge, Contract をコピー
    for (const stroke of strokes) {
      // Instruction（ファイル参照の場合）
      const instr = stroke.instruction as string | undefined;
      if (instr && !instr.includes("\n") && instr.length <= 50) {
        const instrSrc = getBuiltinInstructionPath(instr);
        if (await fileExists(instrSrc)) {
          await this.copyBuiltinFile(
            instrSrc,
            path.join(atelierPath, INSTRUCTIONS_DIR, `${instr}.md`),
            copiedFiles,
            skippedFiles,
            options.force,
          );
        }
      }

      // Knowledge
      const knowledgeList = (stroke.knowledge ?? []) as string[];
      for (const k of knowledgeList) {
        const kSrc = getBuiltinKnowledgePath(k);
        if (await fileExists(kSrc)) {
          await this.copyBuiltinFile(
            kSrc,
            path.join(atelierPath, KNOWLEDGE_DIR, `${k}.md`),
            copiedFiles,
            skippedFiles,
            options.force,
          );
        }
      }

      // Contract
      const contract = stroke.contract as string | undefined;
      if (contract) {
        const cSrc = getBuiltinContractPath(contract);
        if (await fileExists(cSrc)) {
          await this.copyBuiltinFile(
            cSrc,
            path.join(atelierPath, CONTRACTS_DIR, `${contract}.yaml`),
            copiedFiles,
            skippedFiles,
            options.force,
          );
        }
      }
    }

    return Object.freeze({
      commissionName,
      copiedFiles: Object.freeze([...copiedFiles]),
      skippedFiles: Object.freeze([...skippedFiles]),
    });
  }

  /**
   * ビルトインファイルをコピーする。既存ファイルがある場合は force フラグに従う。
   */
  private async copyBuiltinFile(
    srcPath: string,
    destPath: string,
    copiedFiles: string[],
    skippedFiles: string[],
    force?: boolean,
  ): Promise<void> {
    if (await fileExists(destPath)) {
      if (!force) {
        skippedFiles.push(destPath);
        return;
      }
    }
    await ensureDir(path.dirname(destPath));
    await copyFile(srcPath, destPath);
    copiedFiles.push(destPath);
  }
}
