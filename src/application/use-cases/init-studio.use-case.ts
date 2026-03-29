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
  INSTRUCTIONS_DIR,
  KNOWLEDGE_DIR,
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
      INSTRUCTIONS_DIR,
      KNOWLEDGE_DIR,
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

    // デフォルト Commission
    const defaultCommissionPath = path.join(
      atelierPath,
      COMMISSIONS_DIR,
      "default.yaml",
    );
    await writeTextFile(defaultCommissionPath, DEFAULT_COMMISSION_TEMPLATE);
    filesCreated.push(defaultCommissionPath);

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

const DEFAULT_COMMISSION_TEMPLATE = `name: default
description: 設計・実装・テスト・レビューの標準ワークフロー

strokes:
  - name: plan
    palette: coder
    instruction: |
      要件を分析し、実装計画を策定してください。
    inputs:
      - requirements
    outputs:
      - implementation_plan
    transitions:
      - condition: default
        next: implement

  - name: implement
    palette: coder
    allow_edit: true
    instruction: |
      あなたはファイルを直接編集するエージェントです。
      設計に基づき、Edit ツールと Write ツールを使ってファイルを実際に変更・作成してください。
      テキストで計画や説明を述べるのではなく、必ずツールを使ってコードを書いてください。
    inputs:
      - implementation_plan
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
