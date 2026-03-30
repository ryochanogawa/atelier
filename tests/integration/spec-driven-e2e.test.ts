/**
 * spec-driven Commission 統合テスト
 *
 * spec-driven.yaml の読み込みと構造検証に集中する。
 * AI 呼び出しは不要（YAML パース + ファイル存在確認のみ）。
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, it, expect, beforeAll } from "vitest";

// ビルトインリソースのルートディレクトリ
const BUILTIN_DIR = join(__dirname, "../../src/builtin");
const COMMISSION_PATH = join(BUILTIN_DIR, "commissions/spec-driven.yaml");

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

let commission: Commission;

beforeAll(() => {
  const raw = readFileSync(COMMISSION_PATH, "utf-8");
  commission = parseYaml(raw) as Commission;
});

// ---------------------------------------------------------------------------
// 1. spec-driven.yaml 読み込み
// ---------------------------------------------------------------------------
describe("spec-driven.yaml 読み込み", () => {
  it("ファイルが存在し正しくパースされること", () => {
    expect(existsSync(COMMISSION_PATH)).toBe(true);
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
// 2. 6 stroke 順序
// ---------------------------------------------------------------------------
describe("6 stroke 順序", () => {
  const EXPECTED_ORDER = [
    "requirements",
    "design",
    "tasks",
    "implement",
    "test",
    "review",
  ] as const;

  it("requirements -> design -> tasks -> implement -> test -> review の順であること", () => {
    const strokeNames = commission.strokes.map((s) => s.name);
    expect(strokeNames).toEqual(EXPECTED_ORDER);
  });

  it("各 stroke の transition.next が次の stroke を指していること（review 除く）", () => {
    for (let i = 0; i < commission.strokes.length - 1; i++) {
      const stroke = commission.strokes[i];
      const defaultTransition = stroke.transitions?.find(
        (t) => t.condition === "default",
      );
      expect(defaultTransition).toBeDefined();
      expect(defaultTransition!.next).toBe(EXPECTED_ORDER[i + 1]);
    }
  });

  it("最終 stroke (review) に transition が無いこと", () => {
    const review = commission.strokes[commission.strokes.length - 1];
    expect(review.transitions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Canvas 連携（outputs -> inputs の接続）
// ---------------------------------------------------------------------------
describe("Canvas 連携", () => {
  it("requirements の outputs が design の inputs に含まれること", () => {
    const requirements = commission.strokes.find(
      (s) => s.name === "requirements",
    )!;
    const design = commission.strokes.find((s) => s.name === "design")!;

    for (const output of requirements.outputs!) {
      expect(design.inputs).toContain(output);
    }
  });

  it("design の outputs が tasks の inputs に含まれること", () => {
    const design = commission.strokes.find((s) => s.name === "design")!;
    const tasks = commission.strokes.find((s) => s.name === "tasks")!;

    for (const output of design.outputs!) {
      expect(tasks.inputs).toContain(output);
    }
  });

  it("tasks の outputs が implement の inputs に含まれること", () => {
    const tasks = commission.strokes.find((s) => s.name === "tasks")!;
    const implement = commission.strokes.find(
      (s) => s.name === "implement",
    )!;

    for (const output of tasks.outputs!) {
      expect(implement.inputs).toContain(output);
    }
  });

  it("implement の outputs が test の inputs に含まれること", () => {
    const implement = commission.strokes.find(
      (s) => s.name === "implement",
    )!;
    const test = commission.strokes.find((s) => s.name === "test")!;

    for (const output of implement.outputs!) {
      expect(test.inputs).toContain(output);
    }
  });

  it("implement と test の outputs が review の inputs に含まれること", () => {
    const implement = commission.strokes.find(
      (s) => s.name === "implement",
    )!;
    const test = commission.strokes.find((s) => s.name === "test")!;
    const review = commission.strokes.find((s) => s.name === "review")!;

    for (const output of implement.outputs!) {
      expect(review.inputs).toContain(output);
    }
    for (const output of test.outputs!) {
      expect(review.inputs).toContain(output);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. allow_edit フラグ
// ---------------------------------------------------------------------------
describe("allow_edit", () => {
  it("仕様 stroke (requirements/design/tasks) は allow_edit=true", () => {
    const specStrokes = ["requirements", "design", "tasks"];
    for (const name of specStrokes) {
      const stroke = commission.strokes.find((s) => s.name === name)!;
      expect(stroke.allow_edit).toBe(true);
    }
  });

  it("implement は allow_edit=true", () => {
    const implement = commission.strokes.find(
      (s) => s.name === "implement",
    )!;
    expect(implement.allow_edit).toBe(true);
  });

  it("test と review は allow_edit=false または未設定", () => {
    const testStroke = commission.strokes.find((s) => s.name === "test")!;
    const reviewStroke = commission.strokes.find(
      (s) => s.name === "review",
    )!;

    expect(testStroke.allow_edit === false || testStroke.allow_edit === undefined).toBe(true);
    expect(reviewStroke.allow_edit === false || reviewStroke.allow_edit === undefined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. palette 参照
// ---------------------------------------------------------------------------
describe("palette 参照", () => {
  it("仕様 stroke に spec-writer が割り当てられていること", () => {
    const specStrokes = ["requirements", "design", "tasks"];
    for (const name of specStrokes) {
      const stroke = commission.strokes.find((s) => s.name === name)!;
      expect(stroke.palette).toBe("spec-writer");
    }
  });

  it("implement に coder が割り当てられていること", () => {
    const implement = commission.strokes.find(
      (s) => s.name === "implement",
    )!;
    expect(implement.palette).toBe("coder");
  });

  it("test に tester が割り当てられていること", () => {
    const testStroke = commission.strokes.find((s) => s.name === "test")!;
    expect(testStroke.palette).toBe("tester");
  });

  it("review に reviewer が割り当てられていること", () => {
    const review = commission.strokes.find((s) => s.name === "review")!;
    expect(review.palette).toBe("reviewer");
  });
});

// ---------------------------------------------------------------------------
// 6. Contract 参照
// ---------------------------------------------------------------------------
describe("Contract 参照", () => {
  it("requirements に spec-requirements-output が割り当てられていること", () => {
    const stroke = commission.strokes.find(
      (s) => s.name === "requirements",
    )!;
    expect(stroke.contract).toBe("spec-requirements-output");
  });

  it("design に spec-design-output が割り当てられていること", () => {
    const stroke = commission.strokes.find((s) => s.name === "design")!;
    expect(stroke.contract).toBe("spec-design-output");
  });

  it("tasks に spec-tasks-output が割り当てられていること", () => {
    const stroke = commission.strokes.find((s) => s.name === "tasks")!;
    expect(stroke.contract).toBe("spec-tasks-output");
  });
});

// ---------------------------------------------------------------------------
// 7. ビルトインリソース存在確認
// ---------------------------------------------------------------------------
describe("ビルトインリソース存在確認", () => {
  describe("palette YAML ファイル", () => {
    const palettes = ["spec-writer", "coder", "tester", "reviewer"];
    for (const name of palettes) {
      it(`${name}.yaml が存在すること`, () => {
        const filePath = join(BUILTIN_DIR, "palettes", `${name}.yaml`);
        expect(existsSync(filePath)).toBe(true);
      });
    }
  });

  describe("instruction Markdown ファイル", () => {
    const instructions = [
      "spec-requirements",
      "spec-design",
      "spec-tasks",
      "implement",
      "test",
      "review",
    ];
    for (const name of instructions) {
      it(`${name}.md が存在すること`, () => {
        const filePath = join(BUILTIN_DIR, "instructions", `${name}.md`);
        expect(existsSync(filePath)).toBe(true);
      });
    }
  });

  describe("contract YAML ファイル", () => {
    const contracts = [
      "spec-requirements-output",
      "spec-design-output",
      "spec-tasks-output",
    ];
    for (const name of contracts) {
      it(`${name}.yaml が存在すること`, () => {
        const filePath = join(BUILTIN_DIR, "contracts", `${name}.yaml`);
        expect(existsSync(filePath)).toBe(true);
      });
    }
  });
});
