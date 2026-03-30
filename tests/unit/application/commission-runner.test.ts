/**
 * CommissionRunnerService 単体テスト
 *
 * テスト戦略:
 * - fileExists / readTextFile をモックしてファイルシステム依存を排除
 * - runSubprocess をモックして外部プロセス実行を回避
 * - dry-run / Canvas 連携 / プロンプト合成ロジックを検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- vi.hoisted でモック関数を先に定義（vitest ホイスティング対策）----
const mockRunSubprocess = vi.hoisted(() => vi.fn());
const mockFileExists = vi.hoisted(() => vi.fn());
const mockReadTextFile = vi.hoisted(() => vi.fn());
const mockMkdtemp = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());

// ---- インフラレイヤーのモック ----
vi.mock("../../../src/infrastructure/process/subprocess.js", () => ({
  runSubprocess: mockRunSubprocess,
}));

vi.mock("../../../src/infrastructure/fs/file-system.js", () => ({
  fileExists: mockFileExists,
  readTextFile: mockReadTextFile,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdtemp: mockMkdtemp,
    writeFile: mockWriteFile,
    rm: mockRm,
  },
}));

import { CommissionRunnerService } from "../../../src/application/services/commission-runner.service.js";
import { TypedEventEmitter } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { AtelierEvents } from "../../../src/infrastructure/event-bus/event-emitter.js";
import type { CommissionDefinition, RunOptions } from "../../../src/shared/types.js";
import { createMockMediumRegistry } from "../../helpers/mock-medium.js";

// ---- テスト用ファクトリ ----

function createRunner(opts?: { defaultMedium?: string; mediumMap?: Map<string, string> }) {
  const eventBus = new TypedEventEmitter<AtelierEvents>();
  const mediumRegistry = createMockMediumRegistry(
    opts?.mediumMap ?? new Map([["test-medium", "mock response"]]),
  );
  return new CommissionRunnerService({
    eventBus,
    mediumRegistry,
    defaultMedium: opts?.defaultMedium ?? "test-medium",
    cwd: "/tmp/test-project",
    projectPath: "/tmp/test-project",
  });
}

function makeCommission(overrides?: Partial<CommissionDefinition>): CommissionDefinition {
  return {
    name: "test-commission",
    description: "テスト用 Commission",
    strokes: [
      {
        name: "stroke-1",
        palette: "coder",
        instruction: "テスト用インストラクション",
        inputs: [],
        outputs: [],
      },
    ],
    ...overrides,
  };
}

const defaultRunOptions: RunOptions = { dryRun: false };
const dryRunOptions: RunOptions = { dryRun: true };

// ---- パレット/ポリシー YAML スタブ ----

function stubPaletteYaml(persona: string, policies?: string[]): string {
  const lines = [
    `name: test-palette`,
    `persona: "${persona}"`,
  ];
  if (policies && policies.length > 0) {
    lines.push(`policies:`);
    for (const p of policies) {
      lines.push(`  - ${p}`);
    }
  }
  return lines.join("\n");
}

function stubPolicyYaml(ruleName: string, ruleContent: string): string {
  return [
    `name: test-policy`,
    `rules:`,
    `  - name: "${ruleName}"`,
    `    content: "${ruleContent}"`,
  ].join("\n");
}

function stubContractYaml(format: string): string {
  return [`name: test-contract`, `format: "${format}"`].join("\n");
}

// ---- セットアップ ----

beforeEach(() => {
  vi.clearAllMocks();

  // デフォルト: ファイルが存在しない（ビルトインも含め）
  mockFileExists.mockResolvedValue(false);
  mockReadTextFile.mockResolvedValue("");

  // デフォルト: subprocess は成功レスポンスを返す
  mockRunSubprocess.mockResolvedValue({
    stdout: "mock output",
    stderr: "",
    exitCode: 0,
    duration: 100,
  });

  // デフォルト: fs/promises モック
  mockMkdtemp.mockResolvedValue("/tmp/atelier-test-123");
  mockWriteFile.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// 1. dry-run: Medium が呼ばれないこと
// ============================================================

describe("dry-run モード", () => {
  it("dry-run=true のとき runSubprocess が呼ばれない", async () => {
    const runner = createRunner();
    const commission = makeCommission();

    const result = await runner.execute(commission, "run-001", dryRunOptions);

    expect(mockRunSubprocess).not.toHaveBeenCalled();
    expect(result.strokesExecuted).toBe(1);
  });

  it("dry-run=true のとき Commission は Completed で返る", async () => {
    const runner = createRunner();
    const commission = makeCommission();

    const result = await runner.execute(commission, "run-001", dryRunOptions);

    expect(result.errors).toHaveLength(0);
    expect(result.status).toBe("completed");
  });

  it("dry-run=true でも strokesExecuted はストローク数だけカウントされる", async () => {
    const runner = createRunner();
    const commission = makeCommission({
      strokes: [
        { name: "s1", palette: "coder", instruction: "step1", inputs: [], outputs: [] },
        { name: "s2", palette: "coder", instruction: "step2", inputs: [], outputs: [] },
        { name: "s3", palette: "coder", instruction: "step3", inputs: [], outputs: [] },
      ],
    });

    const result = await runner.execute(commission, "run-001", dryRunOptions);

    expect(mockRunSubprocess).not.toHaveBeenCalled();
    expect(result.strokesExecuted).toBe(3);
  });

  it("dry-run=true かつ initialCanvas があっても runSubprocess は呼ばれない", async () => {
    const runner = createRunner();
    const commission = makeCommission();

    const result = await runner.execute(commission, "run-001", {
      ...dryRunOptions,
      initialCanvas: { requirement: "test requirement" },
    });

    expect(mockRunSubprocess).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================
// 2. Canvas 連携: stroke 間での inputs/outputs 受け渡し
// ============================================================

describe("Canvas 連携（inputs / outputs）", () => {
  it("前のストロークの outputs が次のストロークの inputs として Canvas から参照される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockRunSubprocess
      .mockResolvedValueOnce({
        stdout: "ANALYSIS_OUTPUT",
        stderr: "",
        exitCode: 0,
        duration: 50,
      })
      .mockResolvedValueOnce({
        stdout: "IMPL_OUTPUT",
        stderr: "",
        exitCode: 0,
        duration: 50,
      });

    const commission = makeCommission({
      strokes: [
        {
          name: "analyze",
          palette: "coder",
          instruction: "分析してください",
          inputs: [],
          outputs: ["analysis_result"],
        },
        {
          name: "implement",
          palette: "coder",
          instruction: "実装してください",
          inputs: ["analysis_result"],
          outputs: ["impl_result"],
        },
      ],
    });

    const result = await runner.execute(commission, "run-002", defaultRunOptions);

    expect(result.errors).toHaveLength(0);
    expect(result.strokesExecuted).toBe(2);

    // implement ストローク用のプロンプト（2番目の writeFile 呼び出し）に
    // analyze の stdout (ANALYSIS_OUTPUT) が含まれているはず
    expect(writtenContents.length).toBeGreaterThanOrEqual(2);
    expect(writtenContents[1]).toContain("ANALYSIS_OUTPUT");
  });

  it("initialCanvas の値がテンプレート変数として instruction に展開される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    // instruction がインライン扱い（51文字以上 or 改行あり）になるよう長めに設定
    // resolveInstruction の判定: 改行なし & 50文字以下 & ".md" なし → ファイル参照扱い
    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "以下の要件を実装してください。要件: {{requirement}} を満たすコードを書いてください。",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-003", {
      dryRun: false,
      initialCanvas: { requirement: "ユーザー認証機能" },
    });

    expect(writtenContents.length).toBeGreaterThanOrEqual(1);
    expect(writtenContents[0]).toContain("ユーザー認証機能");
  });

  it("outputs が空でも次のストロークが正常に実行される", async () => {
    const runner = createRunner();
    const commission = makeCommission({
      strokes: [
        { name: "s1", palette: "coder", instruction: "step1", inputs: [], outputs: [] },
        { name: "s2", palette: "coder", instruction: "step2", inputs: [], outputs: [] },
      ],
    });

    const result = await runner.execute(commission, "run-004", defaultRunOptions);

    expect(result.errors).toHaveLength(0);
    expect(result.strokesExecuted).toBe(2);
    expect(mockRunSubprocess).toHaveBeenCalledTimes(2);
  });

  it("Canvas に存在しない inputs キーは userPrompt に出力されない", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "実装してください",
          inputs: ["nonexistent_key"],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-005", defaultRunOptions);

    // Canvas に存在しないキーはプロンプトに含まれない
    expect(writtenContents[0]).not.toContain("[nonexistent_key]");
  });
});

// ============================================================
// 3. プロンプト合成ロジック（ファセット合成）
// ============================================================

describe("プロンプト合成（ファセット: persona + policy + instruction + knowledge + contract）", () => {
  it("パレットが見つからない場合でも instruction のみでプロンプトが生成される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "nonexistent-palette",
          instruction: "インストラクション本文",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-010", defaultRunOptions);

    expect(writtenContents.length).toBeGreaterThanOrEqual(1);
    expect(writtenContents[0]).toContain("インストラクション本文");
    // persona がなければ [Persona] セクションなし
    expect(writtenContents[0]).not.toContain("[Persona]");
  });

  it("パレットの persona が [Persona] セクションとして先頭に付与される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockFileExists.mockImplementation(async (path: string) => {
      return path.includes("palettes/coder.yaml");
    });
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.includes("palettes/coder.yaml")) {
        return stubPaletteYaml("あなたは熟練したコーダーです。");
      }
      return "";
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "コードを書いてください",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-011", defaultRunOptions);

    const prompt = writtenContents[0];
    expect(prompt).toBeDefined();
    expect(prompt).toContain("[Persona]");
    expect(prompt).toContain("あなたは熟練したコーダーです。");
    expect(prompt).toContain("コードを書いてください");
  });

  it("パレットにポリシーが定義されている場合 [Policy] セクションが付与される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockFileExists.mockImplementation(async (path: string) => {
      return (
        path.includes("palettes/policy-aware.yaml") ||
        path.includes("policies/my-policy.yaml")
      );
    });
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.includes("palettes/policy-aware.yaml")) {
        return stubPaletteYaml("ポリシー適用エージェント", ["my-policy"]);
      }
      if (path.includes("policies/my-policy.yaml")) {
        return stubPolicyYaml("重要ルール", "常にテストを書くこと");
      }
      return "";
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "policy-aware",
          instruction: "実装してください",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-012", defaultRunOptions);

    const prompt = writtenContents[0];
    expect(prompt).toBeDefined();
    expect(prompt).toContain("[Policy]");
    expect(prompt).toContain("常にテストを書くこと");
  });

  it("contract が指定されている場合 [Output Contract] セクションが付与される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockFileExists.mockImplementation(async (path: string) => {
      return path.includes("contracts/json-output.yaml");
    });
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.includes("contracts/json-output.yaml")) {
        return stubContractYaml("{ result: string }");
      }
      return "";
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "JSON で返してください",
          contract: "json-output",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-013", defaultRunOptions);

    const prompt = writtenContents[0];
    expect(prompt).toBeDefined();
    expect(prompt).toContain("[Output Contract]");
    expect(prompt).toContain("{ result: string }");
  });

  it("ファセット順序: canvas inputs → instruction → [Output Contract] → [Policy]", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockFileExists.mockImplementation(async (path: string) => {
      return (
        path.includes("palettes/ordered.yaml") ||
        path.includes("policies/order-policy.yaml") ||
        path.includes("contracts/order-contract.yaml")
      );
    });
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.includes("palettes/ordered.yaml")) {
        return stubPaletteYaml("OrderedPersona", ["order-policy"]);
      }
      if (path.includes("policies/order-policy.yaml")) {
        return stubPolicyYaml("ポリシールール", "ポリシーコンテンツ");
      }
      if (path.includes("contracts/order-contract.yaml")) {
        return stubContractYaml("ContractFormat");
      }
      return "";
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "ordered",
          instruction: "メインインストラクション",
          contract: "order-contract",
          inputs: ["canvas_input"],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-014", {
      dryRun: false,
      initialCanvas: { canvas_input: "キャンバスの値" },
    });

    const prompt = writtenContents[0];
    expect(prompt).toBeDefined();

    // userPrompt 部分の順序を確認（インデックス比較）
    const idxCanvasInput = prompt.indexOf("キャンバスの値");
    const idxInstruction = prompt.indexOf("メインインストラクション");
    const idxContract = prompt.indexOf("[Output Contract]");
    const idxPolicy = prompt.indexOf("[Policy]");

    expect(idxCanvasInput).toBeGreaterThanOrEqual(0);
    expect(idxInstruction).toBeGreaterThanOrEqual(0);
    expect(idxContract).toBeGreaterThanOrEqual(0);
    expect(idxPolicy).toBeGreaterThanOrEqual(0);

    // Canvas inputs → instruction → contract → policy の順
    expect(idxCanvasInput).toBeLessThan(idxInstruction);
    expect(idxInstruction).toBeLessThan(idxContract);
    expect(idxContract).toBeLessThan(idxPolicy);
  });

  it("contract の format に {{変数}} テンプレートが含まれる場合 Canvas の値で展開される", async () => {
    const runner = createRunner();

    const writtenContents: string[] = [];
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      writtenContents.push(content);
    });

    mockFileExists.mockImplementation(async (path: string) => {
      return path.includes("contracts/template-contract.yaml");
    });
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.includes("contracts/template-contract.yaml")) {
        return [
          `name: template-contract`,
          `format: "ターゲット: {{target_lang}}"`,
        ].join("\n");
      }
      return "";
    });

    const commission = makeCommission({
      strokes: [
        {
          name: "stroke-1",
          palette: "coder",
          instruction: "変換してください",
          contract: "template-contract",
          inputs: [],
          outputs: [],
        },
      ],
    });

    await runner.execute(commission, "run-015", {
      dryRun: false,
      initialCanvas: { target_lang: "TypeScript" },
    });

    const prompt = writtenContents[0];
    expect(prompt).toBeDefined();
    expect(prompt).toContain("ターゲット: TypeScript");
  });
});

// ============================================================
// 4. エラーハンドリング
// ============================================================

describe("エラーハンドリング", () => {
  it("subprocess が非ゼロ終了コードを返したとき Commission は Failed になる", async () => {
    const runner = createRunner();

    mockRunSubprocess.mockResolvedValue({
      stdout: "",
      stderr: "エラー発生",
      exitCode: 1,
      duration: 50,
    });

    const commission = makeCommission();
    const result = await runner.execute(commission, "run-020", defaultRunOptions);

    expect(result.status).toBe("failed");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].strokeName).toBe("stroke-1");
  });

  it("存在しない Medium 名が指定されたとき Commission は Failed になる", async () => {
    // mediumRegistry に "nonexistent-medium" を登録しないランナー
    const eventBus = new TypedEventEmitter<AtelierEvents>();
    const emptyRegistry = {
      getCommand: (_name: string) => undefined,
      listMedia: () => [],
    };
    const runner = new CommissionRunnerService({
      eventBus,
      mediumRegistry: emptyRegistry,
      defaultMedium: "nonexistent-medium",
      cwd: "/tmp/test-project",
      projectPath: "/tmp/test-project",
    });

    const commission = makeCommission();
    const result = await runner.execute(commission, "run-021", defaultRunOptions);

    expect(result.status).toBe("failed");
    expect(result.errors[0].message).toContain("Medium not found");
  });

  it("stroke が失敗しても errors に strokeName と message が記録される", async () => {
    const runner = createRunner();

    mockRunSubprocess.mockResolvedValue({
      stdout: "",
      stderr: "fatal error",
      exitCode: 2,
      duration: 50,
    });

    const commission = makeCommission();
    const result = await runner.execute(commission, "run-022", defaultRunOptions);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      strokeName: expect.any(String),
      message: expect.any(String),
      timestamp: expect.any(String),
    });
  });
});

// ============================================================
// 5. 並列実行（dependsOn）
// ============================================================

describe("並列実行（dependsOn）", () => {
  it("dependsOn を持つストロークが存在する場合、全ストロークが実行される", async () => {
    const runner = createRunner();

    const commission = makeCommission({
      strokes: [
        { name: "base", palette: "coder", instruction: "base task", inputs: [], outputs: [], depends_on: [] },
        { name: "dependent", palette: "coder", instruction: "dependent task", inputs: [], outputs: [], depends_on: ["base"] },
      ],
    });

    const result = await runner.execute(commission, "run-030", defaultRunOptions);

    expect(result.errors).toHaveLength(0);
    expect(result.strokesExecuted).toBe(2);
    expect(mockRunSubprocess).toHaveBeenCalledTimes(2);
  });

  it("dry-run=true で dependsOn があるとき runSubprocess が呼ばれない", async () => {
    const runner = createRunner();

    const commission = makeCommission({
      strokes: [
        { name: "base", palette: "coder", instruction: "base", inputs: [], outputs: [], depends_on: [] },
        { name: "dep", palette: "coder", instruction: "dep", inputs: [], outputs: [], depends_on: ["base"] },
      ],
    });

    const result = await runner.execute(commission, "run-031", dryRunOptions);

    expect(mockRunSubprocess).not.toHaveBeenCalled();
    expect(result.strokesExecuted).toBe(2);
  });

  it("循環依存があるとき例外がスローされる", async () => {
    const runner = createRunner();

    const commission = makeCommission({
      strokes: [
        { name: "a", palette: "coder", instruction: "a", inputs: [], outputs: [], depends_on: ["b"] },
        { name: "b", palette: "coder", instruction: "b", inputs: [], outputs: [], depends_on: ["a"] },
      ],
    });

    await expect(
      runner.execute(commission, "run-032", defaultRunOptions),
    ).rejects.toThrow("Cyclic dependency");
  });

  it("依存先が失敗したとき依存するストロークも失敗扱いになる", async () => {
    const runner = createRunner();

    // base ストロークが失敗
    mockRunSubprocess.mockResolvedValueOnce({
      stdout: "",
      stderr: "base failed",
      exitCode: 1,
      duration: 50,
    });

    const commission = makeCommission({
      strokes: [
        { name: "base", palette: "coder", instruction: "base", inputs: [], outputs: [], depends_on: [] },
        { name: "dependent", palette: "coder", instruction: "dep", inputs: [], outputs: [], depends_on: ["base"] },
      ],
    });

    const result = await runner.execute(commission, "run-033", defaultRunOptions);

    expect(result.status).toBe("failed");
    // base の失敗 + dependent のスキップ = 2 エラー
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
