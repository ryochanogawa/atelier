/**
 * InitStudio Use Case
 * .atelier/ ディレクトリとテンプレートファイルを生成する。
 */

import path from "node:path";
import { resolveAtelierPath } from "../../shared/utils.js";
import {
  COMMISSIONS_DIR,
  PALETTES_DIR,
  POLICIES_DIR,
  CONTRACTS_DIR,
  LOGS_DIR,
  STUDIO_CONFIG_FILE,
} from "../../shared/constants.js";
import {
  ensureDir,
  writeTextFile,
  dirExists,
} from "../../infrastructure/fs/file-system.js";

export interface InitResult {
  readonly created: boolean;
  readonly path: string;
  readonly filesCreated: readonly string[];
}

export class StudioInitUseCase {
  async execute(projectPath: string): Promise<InitResult> {
    const atelierPath = resolveAtelierPath(projectPath);
    const filesCreated: string[] = [];

    if (await dirExists(atelierPath)) {
      return {
        created: false,
        path: atelierPath,
        filesCreated: [],
      };
    }

    // ディレクトリ構造を作成
    const dirs = [
      COMMISSIONS_DIR,
      PALETTES_DIR,
      POLICIES_DIR,
      CONTRACTS_DIR,
      LOGS_DIR,
    ];

    for (const dir of dirs) {
      await ensureDir(path.join(atelierPath, dir));
    }

    // studio.yaml テンプレート
    const studioConfigPath = path.join(atelierPath, STUDIO_CONFIG_FILE);
    await writeTextFile(
      studioConfigPath,
      STUDIO_YAML_TEMPLATE,
    );
    filesCreated.push(studioConfigPath);

    // サンプル Commission
    const sampleCommissionPath = path.join(
      atelierPath,
      COMMISSIONS_DIR,
      "sample.yaml",
    );
    await writeTextFile(sampleCommissionPath, SAMPLE_COMMISSION_TEMPLATE);
    filesCreated.push(sampleCommissionPath);

    // サンプル Palette
    const samplePalettePath = path.join(
      atelierPath,
      PALETTES_DIR,
      "coder.yaml",
    );
    await writeTextFile(samplePalettePath, SAMPLE_PALETTE_TEMPLATE);
    filesCreated.push(samplePalettePath);

    return {
      created: true,
      path: atelierPath,
      filesCreated,
    };
  }
}

const STUDIO_YAML_TEMPLATE = `studio:
  default_medium: claude-code
  language: ja
  log_level: info

media:
  claude-code:
    command: claude
    args: ["--print", "--output-format", "json"]
`;

const SAMPLE_COMMISSION_TEMPLATE = `name: sample
description: サンプルCommission

strokes:
  - name: implement
    palette: coder
    instruction: |
      与えられた仕様に基づいてコードを実装してください。
    inputs: []
    outputs:
      - implementation
    transitions:
      - condition: default
        next: review

  - name: review
    palette: coder
    instruction: |
      実装されたコードをレビューしてください。
    inputs:
      - implementation
    outputs:
      - review_result
`;

const SAMPLE_PALETTE_TEMPLATE = `name: coder
description: コーディング担当のAIエージェント

persona: |
  あなたは熟練のソフトウェアエンジニアです。
  クリーンコード、テスト駆動開発、ベストプラクティスを重視します。

defaults:
  temperature: 0.3
`;
