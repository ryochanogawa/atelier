/**
 * Commission-Knowledge 統合テスト
 *
 * Commission YAML の knowledge 参照がビルトイン Knowledge に
 * 正しく紐付いていることを検証する。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect, beforeAll } from "vitest";

// ビルトインリソースのルートディレクトリ
const BUILTIN_DIR = join(__dirname, "../../src/builtin");

interface Stroke {
  name: string;
  palette: string;
  instruction: string;
  knowledge?: string[];
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
// ヘルパー
// ---------------------------------------------------------------------------
function loadCommission(filename: string): Commission {
  const filePath = join(BUILTIN_DIR, "commissions", filename);
  const raw = readFileSync(filePath, "utf-8");
  return parseYaml(raw) as Commission;
}

function listBuiltinKnowledge(): string[] {
  return readdirSync(join(BUILTIN_DIR, "knowledge"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

// ---------------------------------------------------------------------------
// 1. requirements-analysis.yaml のパースと knowledge 参照
// ---------------------------------------------------------------------------
describe("requirements-analysis.yaml パースと knowledge 参照", () => {
  let commission: Commission;

  beforeAll(() => {
    commission = loadCommission("requirements-analysis.yaml");
  });

  it("ファイルが存在し正しくパースできること", () => {
    expect(
      existsSync(join(BUILTIN_DIR, "commissions/requirements-analysis.yaml")),
    ).toBe(true);
    expect(commission).toBeDefined();
    expect(commission.name).toBe("requirements-analysis");
    expect(commission.description).toBeTruthy();
    expect(Array.isArray(commission.strokes)).toBe(true);
  });

  it("validate ストロークに knowledge: [requirements-validation] が設定されていること", () => {
    const validateStroke = commission.strokes.find(
      (s) => s.name === "validate",
    );
    expect(validateStroke).toBeDefined();
    expect(validateStroke!.knowledge).toBeDefined();
    expect(validateStroke!.knowledge).toContain("requirements-validation");
  });
});

// ---------------------------------------------------------------------------
// 2. test-enhancement.yaml のパースと knowledge 参照
// ---------------------------------------------------------------------------
describe("test-enhancement.yaml パースと knowledge 参照", () => {
  let commission: Commission;

  beforeAll(() => {
    commission = loadCommission("test-enhancement.yaml");
  });

  it("ファイルが存在し正しくパースできること", () => {
    expect(
      existsSync(join(BUILTIN_DIR, "commissions/test-enhancement.yaml")),
    ).toBe(true);
    expect(commission).toBeDefined();
    expect(commission.name).toBe("test-enhancement");
    expect(commission.description).toBeTruthy();
    expect(Array.isArray(commission.strokes)).toBe(true);
  });

  it("analyze-coverage ストロークに knowledge: [test-coverage-analysis] が設定されていること", () => {
    const coverageStroke = commission.strokes.find(
      (s) => s.name === "analyze-coverage",
    );
    expect(coverageStroke).toBeDefined();
    expect(coverageStroke!.knowledge).toBeDefined();
    expect(coverageStroke!.knowledge).toContain("test-coverage-analysis");
  });

  it("identify-gaps ストロークに knowledge: [test-gap-detection] が設定されていること", () => {
    const gapsStroke = commission.strokes.find(
      (s) => s.name === "identify-gaps",
    );
    expect(gapsStroke).toBeDefined();
    expect(gapsStroke!.knowledge).toBeDefined();
    expect(gapsStroke!.knowledge).toContain("test-gap-detection");
  });
});

// ---------------------------------------------------------------------------
// 3. Knowledge ファイルの存在確認
// ---------------------------------------------------------------------------
describe("新規 Knowledge ファイルの存在確認", () => {
  const requiredKnowledge = [
    "requirements-validation",
    "test-coverage-analysis",
    "test-gap-detection",
  ];

  const availableKnowledge = listBuiltinKnowledge();

  for (const name of requiredKnowledge) {
    it(`${name}.md がビルトイン knowledge に存在すること`, () => {
      expect(
        existsSync(join(BUILTIN_DIR, "knowledge", `${name}.md`)),
      ).toBe(true);
      expect(availableKnowledge).toContain(name);
    });

    it(`${name}.md が空ファイルではないこと`, () => {
      const content = readFileSync(
        join(BUILTIN_DIR, "knowledge", `${name}.md`),
        "utf-8",
      );
      expect(content.trim().length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. 全 Commission の knowledge 参照整合性
// ---------------------------------------------------------------------------
describe("全 Commission の knowledge 参照整合性", () => {
  const commissionFiles = readdirSync(join(BUILTIN_DIR, "commissions")).filter(
    (f) => f.endsWith(".yaml"),
  );
  const availableKnowledge = listBuiltinKnowledge();

  for (const file of commissionFiles) {
    describe(`${file}`, () => {
      const commission = loadCommission(file);

      for (const stroke of commission.strokes) {
        if (stroke.knowledge && stroke.knowledge.length > 0) {
          for (const knowledgeName of stroke.knowledge) {
            it(`stroke "${stroke.name}" の knowledge "${knowledgeName}" がビルトインに存在すること`, () => {
              expect(
                availableKnowledge,
                `knowledge "${knowledgeName}" が見つかりません。利用可能: ${availableKnowledge.join(", ")}`,
              ).toContain(knowledgeName);
            });
          }
        }
      }
    });
  }
});
