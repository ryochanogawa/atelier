/**
 * ArpeggioRunner Service 単体テスト
 *
 * テスト戦略:
 * - parseCsv, expandTemplate はエクスポート済みなので直接テスト
 * - readCsvBatches は fs.readFileSync をモックしてテスト
 * - runArpeggio は readFileSync + executor をモックして統合的にテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- fs モック ----
const mockReadFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

import {
  parseCsv,
  expandTemplate,
  readCsvBatches,
  runArpeggio,
} from "../../../src/application/services/arpeggio-runner.service.js";
import type {
  DataBatch,
  BatchExecutor,
} from "../../../src/application/services/arpeggio-runner.service.js";
import type { ArpeggioConfig } from "../../../src/domain/models/stroke.model.js";

// ─── CSV パーステスト ──────────────────────────────────────────────

describe("parseCsv", () => {
  it("基本的なCSVをパースできる", () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["name", "age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
  });

  it("クォートフィールドを正しく処理する", () => {
    const csv = 'name,desc\nAlice,"hello, world"\nBob,"line1\nline2"';
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["name", "desc"],
      ["Alice", "hello, world"],
      ["Bob", "line1\nline2"],
    ]);
  });

  it("エスケープクォート (\"\") を処理する", () => {
    const csv = 'name,quote\nAlice,"She said ""hello"""\nBob,"a""b"';
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["name", "quote"],
      ["Alice", 'She said "hello"'],
      ["Bob", 'a"b'],
    ]);
  });

  it("空行をスキップしない（空フィールドとして処理）", () => {
    // parseCsv は空行を空フィールドの行として返す
    const csv = "a,b\n\nc,d";
    const result = parseCsv(csv);
    expect(result).toEqual([["a", "b"], [""], ["c", "d"]]);
  });

  it("\\r\\n 改行を処理する", () => {
    const csv = "name,age\r\nAlice,30\r\nBob,25";
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["name", "age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
  });

  it("\\r のみの改行を処理する", () => {
    const csv = "name,age\rAlice,30\rBob,25";
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["name", "age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
  });

  it("末尾に改行がない場合でも最後の行を返す", () => {
    const csv = "a,b\n1,2";
    const result = parseCsv(csv);
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("空文字列を渡すと空配列を返す", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

// ─── バッチ分割テスト ─────────────────────────────────────────────

describe("readCsvBatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("batch_size=5 で 10行を 2バッチに分割する", () => {
    const header = "id,name";
    const rows = Array.from({ length: 10 }, (_, i) => `${i + 1},user${i + 1}`);
    const csv = [header, ...rows].join("\n");
    mockReadFileSync.mockReturnValue(csv);

    const batches = readCsvBatches("/dummy.csv", 5);

    expect(batches).toHaveLength(2);
    expect(batches[0]!.rows).toHaveLength(5);
    expect(batches[1]!.rows).toHaveLength(5);
    expect(batches[0]!.batchIndex).toBe(0);
    expect(batches[1]!.batchIndex).toBe(1);
    expect(batches[0]!.totalBatches).toBe(2);
    expect(batches[1]!.totalBatches).toBe(2);
  });

  it("割り切れない場合、最後のバッチは端数になる", () => {
    const header = "id,name";
    const rows = Array.from({ length: 7 }, (_, i) => `${i + 1},user${i + 1}`);
    const csv = [header, ...rows].join("\n");
    mockReadFileSync.mockReturnValue(csv);

    const batches = readCsvBatches("/dummy.csv", 3);

    expect(batches).toHaveLength(3);
    expect(batches[0]!.rows).toHaveLength(3);
    expect(batches[1]!.rows).toHaveLength(3);
    expect(batches[2]!.rows).toHaveLength(1);
  });

  it("ヘッダーのみのCSVはエラーを投げる", () => {
    mockReadFileSync.mockReturnValue("id,name\n");
    // 末尾改行ありだと空行が1行入るので、空行なしバージョンも確認
    // parseCsv("id,name\n") => [["id","name"], [""]] なのでデータ行ありとなる

    mockReadFileSync.mockReturnValue("id,name");
    expect(() => readCsvBatches("/dummy.csv", 5)).toThrow("no data rows");
  });

  it("DataRow のカラム名がヘッダーと一致する", () => {
    mockReadFileSync.mockReturnValue("name,email\nAlice,alice@test.com");

    const batches = readCsvBatches("/dummy.csv", 10);

    expect(batches[0]!.rows[0]).toEqual({
      name: "Alice",
      email: "alice@test.com",
    });
  });
});

// ─── テンプレート展開テスト ───────────────────────────────────────

describe("expandTemplate", () => {
  const batch: DataBatch = {
    rows: [
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ],
    batchIndex: 1,
    totalBatches: 3,
  };

  it("{{batch_data}} を全行の key: value 形式で展開する", () => {
    const result = expandTemplate("Data:\n{{batch_data}}", batch);
    expect(result).toBe(
      "Data:\nname: Alice\nage: 30\n---\nname: Bob\nage: 25",
    );
  });

  it("{{batch_index}} をバッチインデックスで展開する", () => {
    const result = expandTemplate("Batch {{batch_index}}", batch);
    expect(result).toBe("Batch 1");
  });

  it("{{total_batches}} を全バッチ数で展開する", () => {
    const result = expandTemplate("Total: {{total_batches}}", batch);
    expect(result).toBe("Total: 3");
  });

  it("{{col:N:name}} で特定行の特定カラム値を取得する", () => {
    const result = expandTemplate("First: {{col:1:name}}, Second: {{col:2:age}}", batch);
    expect(result).toBe("First: Alice, Second: 25");
  });

  it("{{line:N}} で特定行を key: value 形式で展開する", () => {
    const result = expandTemplate("Row1:\n{{line:1}}", batch);
    expect(result).toBe("Row1:\nname: Alice\nage: 30");
  });

  it("複数のプレースホルダーを同時に展開できる", () => {
    const template =
      "Batch {{batch_index}}/{{total_batches}}\n{{batch_data}}\nFirst name: {{col:1:name}}";
    const result = expandTemplate(template, batch);
    expect(result).toContain("Batch 1/3");
    expect(result).toContain("name: Alice");
    expect(result).toContain("First name: Alice");
  });

  it("{{col:N:name}} で範囲外の行を指定するとエラー", () => {
    expect(() => expandTemplate("{{col:5:name}}", batch)).toThrow(
      "references row 5 but batch has 2 rows",
    );
  });

  it("{{col:N:name}} で存在しないカラムを指定するとエラー", () => {
    expect(() => expandTemplate("{{col:1:missing}}", batch)).toThrow(
      'references unknown column "missing"',
    );
  });

  it("{{line:N}} で範囲外の行を指定するとエラー", () => {
    expect(() => expandTemplate("{{line:10}}", batch)).toThrow(
      "references row 10 but batch has 2 rows",
    );
  });
});

// ─── runArpeggio 統合テスト（concat マージ） ─────────────────────

describe("runArpeggio (concat merge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeConfig(overrides: Partial<ArpeggioConfig> = {}): ArpeggioConfig {
    return {
      sourcePath: "/test/data.csv",
      batchSize: 2,
      concurrency: 2,
      merge: "concat",
      separator: "\n---\n",
      maxRetries: 0,
      retryDelayMs: 0,
      ...overrides,
    };
  }

  it("全バッチを実行し concat で結合する", async () => {
    // 4行 / batchSize=2 => 2バッチ
    mockReadFileSync.mockReturnValue("id,name\n1,Alice\n2,Bob\n3,Carol\n4,Dave");

    const executor: BatchExecutor = vi.fn(async (instruction: string) => {
      if (instruction.includes("Alice")) return "Result-A";
      if (instruction.includes("Carol")) return "Result-B";
      return "Unknown";
    });

    const result = await runArpeggio(
      makeConfig(),
      "Process: {{batch_data}}",
      executor,
    );

    expect(result).toBe("Result-A\n---\nResult-B");
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("バッチ順序が保持される（インデックス順にソート）", async () => {
    mockReadFileSync.mockReturnValue("id\n1\n2\n3\n4");

    // executor が逆順で解決しても結果は batchIndex 順
    const executor: BatchExecutor = vi.fn(async (instruction: string) => {
      if (instruction.includes("id: 1")) {
        await new Promise((r) => setTimeout(r, 20));
        return "First";
      }
      return "Second";
    });

    const result = await runArpeggio(
      makeConfig(),
      "{{batch_data}}",
      executor,
    );

    expect(result).toBe("First\n---\nSecond");
  });

  it("全バッチ失敗時はエラーを投げる", async () => {
    mockReadFileSync.mockReturnValue("id\n1\n2");

    const executor: BatchExecutor = vi.fn(async () => {
      throw new Error("LLM error");
    });

    await expect(
      runArpeggio(makeConfig({ batchSize: 1 }), "{{batch_data}}", executor),
    ).rejects.toThrow("Arpeggio failed");
  });

  it("リトライ後に成功する", async () => {
    mockReadFileSync.mockReturnValue("id\n1");
    let attempt = 0;

    const executor: BatchExecutor = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("transient");
      return "OK";
    });

    const result = await runArpeggio(
      makeConfig({ batchSize: 1, maxRetries: 1, retryDelayMs: 0 }),
      "{{batch_data}}",
      executor,
    );

    expect(result).toBe("OK");
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("セパレータを変更できる", async () => {
    mockReadFileSync.mockReturnValue("id\n1\n2");

    const executor: BatchExecutor = vi.fn(async () => "chunk");

    const result = await runArpeggio(
      makeConfig({ batchSize: 1, separator: " | " }),
      "{{batch_data}}",
      executor,
    );

    expect(result).toBe("chunk | chunk");
  });
});
