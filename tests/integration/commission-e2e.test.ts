/**
 * Commission E2E インテグレーションテスト
 *
 * ビルトイン Commission の構造的な整合性を検証する。
 * AI 呼び出しは不要（YAML パース + ファイル存在確認のみ）。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect, beforeAll } from "vitest";

// ビルトインリソースのルートディレクトリ
const BUILTIN_DIR = join(__dirname, "../../src/builtin");

interface Stroke {
  name: string;
  palette: string;
  instruction: string;
  contract?: string;
  allow_edit?: boolean;
  inputs?: string[];
  outputs?: string[];
  transitions?: Array<{ condition: string; next: string }>;
}

interface Commission {
  name: string;
  description: string;
  strokes: Stroke[];
}

// ---------------------------------------------------------------------------
// ヘルパー: YAML 読み込み
// ---------------------------------------------------------------------------
function loadCommission(filename: string): Commission {
  const filePath = join(BUILTIN_DIR, "commissions", filename);
  const raw = readFileSync(filePath, "utf-8");
  return parseYaml(raw) as Commission;
}

// ---------------------------------------------------------------------------
// ビルトインリソース一覧を取得
// ---------------------------------------------------------------------------
function listBuiltinPalettes(): string[] {
  return readdirSync(join(BUILTIN_DIR, "palettes"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

function listBuiltinInstructions(): string[] {
  return readdirSync(join(BUILTIN_DIR, "instructions"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function listBuiltinContracts(): string[] {
  return readdirSync(join(BUILTIN_DIR, "contracts"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

function listCommissionFiles(): string[] {
  return readdirSync(join(BUILTIN_DIR, "commissions")).filter((f) =>
    f.endsWith(".yaml"),
  );
}

// ---------------------------------------------------------------------------
// 1. default.yaml 読み込み
// ---------------------------------------------------------------------------
describe("default.yaml 読み込み", () => {
  let commission: Commission;

  beforeAll(() => {
    commission = loadCommission("default.yaml");
  });

  it("ファイルが存在し正しくパースされること", () => {
    expect(
      existsSync(join(BUILTIN_DIR, "commissions/default.yaml")),
    ).toBe(true);
    expect(commission).toBeDefined();
    expect(commission.name).toBe("default");
    expect(commission.description).toBeTruthy();
    expect(Array.isArray(commission.strokes)).toBe(true);
  });

  it("4つの stroke（plan → implement → test → review）が定義されていること", () => {
    expect(commission.strokes).toHaveLength(4);
    const strokeNames = commission.strokes.map((s) => s.name);
    expect(strokeNames).toEqual(["plan", "implement", "test", "review"]);
  });
});

// ---------------------------------------------------------------------------
// 2. default stroke 遷移
// ---------------------------------------------------------------------------
describe("default stroke 遷移", () => {
  let commission: Commission;

  beforeAll(() => {
    commission = loadCommission("default.yaml");
  });

  it("各 stroke の transitions.next が次の stroke 名と一致すること（最終 stroke 除く）", () => {
    const strokes = commission.strokes;
    for (let i = 0; i < strokes.length - 1; i++) {
      const stroke = strokes[i];
      const defaultTransition = stroke.transitions?.find(
        (t) => t.condition === "default",
      );
      expect(
        defaultTransition,
        `stroke "${stroke.name}" に default transition が必要`,
      ).toBeDefined();
      expect(defaultTransition!.next).toBe(strokes[i + 1].name);
    }
  });

  it("最終 stroke (review) は transition を持たないこと", () => {
    const lastStroke = commission.strokes[commission.strokes.length - 1];
    expect(lastStroke.name).toBe("review");
    expect(lastStroke.transitions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. spec-driven.yaml 読み込み
// ---------------------------------------------------------------------------
describe("spec-driven.yaml 読み込み", () => {
  let commission: Commission;

  beforeAll(() => {
    commission = loadCommission("spec-driven.yaml");
  });

  it("ファイルが存在し正しくパースされること", () => {
    expect(
      existsSync(join(BUILTIN_DIR, "commissions/spec-driven.yaml")),
    ).toBe(true);
    expect(commission).toBeDefined();
    expect(commission.name).toBe("spec-driven");
    expect(commission.description).toBeTruthy();
    expect(Array.isArray(commission.strokes)).toBe(true);
  });

  it("6つの stroke が定義されていること", () => {
    expect(commission.strokes).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// 4. 全ビルトイン Commission 読み込み
// ---------------------------------------------------------------------------
describe("全ビルトイン Commission 読み込み", () => {
  const commissionFiles = listCommissionFiles();

  it("少なくとも 1 つの Commission YAML が存在すること", () => {
    expect(commissionFiles.length).toBeGreaterThan(0);
  });

  for (const file of commissionFiles) {
    it(`${file} が正しくパースできること`, () => {
      const commission = loadCommission(file);
      expect(commission).toBeDefined();
      expect(commission.name).toBeTruthy();
      expect(commission.description).toBeTruthy();
      expect(Array.isArray(commission.strokes)).toBe(true);
      expect(commission.strokes.length).toBeGreaterThan(0);

      // 各 stroke に最低限必要なフィールドが存在すること
      for (const stroke of commission.strokes) {
        expect(stroke.name).toBeTruthy();
        expect(stroke.palette).toBeTruthy();
        expect(stroke.instruction).toBeTruthy();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Palette 参照の整合性
// ---------------------------------------------------------------------------
describe("Palette 参照の整合性", () => {
  const commissionFiles = listCommissionFiles();
  const availablePalettes = listBuiltinPalettes();

  for (const file of commissionFiles) {
    describe(`${file}`, () => {
      const commission = loadCommission(file);

      for (const stroke of commission.strokes) {
        it(`stroke "${stroke.name}" の palette "${stroke.palette}" がビルトインに存在すること`, () => {
          expect(
            availablePalettes,
            `palette "${stroke.palette}" が見つかりません。利用可能: ${availablePalettes.join(", ")}`,
          ).toContain(stroke.palette);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Instruction 参照の整合性
// ---------------------------------------------------------------------------
describe("Instruction 参照の整合性", () => {
  const commissionFiles = listCommissionFiles();
  const availableInstructions = listBuiltinInstructions();

  for (const file of commissionFiles) {
    describe(`${file}`, () => {
      const commission = loadCommission(file);

      for (const stroke of commission.strokes) {
        // instruction がインラインテキスト（改行を含む or 長い文章）の場合はスキップ
        // ファイル参照の場合は短い名前のみ（スペースを含まず1行）
        const isFileRef =
          !stroke.instruction.includes("\n") &&
          stroke.instruction.trim().length < 100 &&
          !stroke.instruction.includes("{{");

        if (isFileRef) {
          it(`stroke "${stroke.name}" の instruction "${stroke.instruction}" がビルトインに存在すること`, () => {
            expect(
              availableInstructions,
              `instruction "${stroke.instruction}" が見つかりません。利用可能: ${availableInstructions.join(", ")}`,
            ).toContain(stroke.instruction);
          });
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Contract 参照の整合性
// ---------------------------------------------------------------------------
describe("Contract 参照の整合性", () => {
  const commissionFiles = listCommissionFiles();
  const availableContracts = listBuiltinContracts();

  for (const file of commissionFiles) {
    describe(`${file}`, () => {
      const commission = loadCommission(file);

      for (const stroke of commission.strokes) {
        if (stroke.contract) {
          it(`stroke "${stroke.name}" の contract "${stroke.contract}" がビルトインに存在すること`, () => {
            expect(
              availableContracts,
              `contract "${stroke.contract}" が見つかりません。利用可能: ${availableContracts.join(", ")}`,
            ).toContain(stroke.contract);
          });
        }
      }
    });
  }
});
