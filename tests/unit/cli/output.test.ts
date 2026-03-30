import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setOutputFormat,
  getOutputFormat,
  isDecorated,
  printHeader,
  printSectionDivider,
  printRunResult,
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printProgressBar,
  createSpinner,
} from "../../../src/cli/output.js";
import { SYMBOLS, BORDERS } from "../../../src/cli/theme.js";
import type { RunResultDto } from "../../../src/application/dto/run-result.dto.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

function capturedLog(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

function capturedError(): string {
  return errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

const MOCK_RESULT: RunResultDto = {
  runId: "run_test123",
  commissionName: "test-commission",
  status: "completed",
  strokesExecuted: 3,
  strokesTotal: 5,
  duration: 12345,
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:00:12Z",
  errors: [],
};

const MOCK_RESULT_FAILED: RunResultDto = {
  ...MOCK_RESULT,
  status: "failed",
  errors: [
    { strokeName: "stroke-1", message: "timeout", timestamp: "2026-01-01T00:00:10Z" },
  ],
};

describe("output.ts", () => {
  let originalIsTTY: boolean | undefined;
  let originalNoColor: string | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
    setOutputFormat("table");
    originalIsTTY = process.stdout.isTTY;
    originalNoColor = process.env.NO_COLOR;
    originalColumns = process.stdout.columns;
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
  });

  describe("isDecorated()", () => {
    it("JSON モードで false を返す", () => {
      setOutputFormat("json");
      expect(isDecorated()).toBe(false);
    });

    it("NO_COLOR 設定時に false を返す", () => {
      process.env.NO_COLOR = "1";
      expect(isDecorated()).toBe(false);
    });

    it("非 TTY で false を返す", () => {
      Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true });
      expect(isDecorated()).toBe(false);
    });

    it("TTY かつ NO_COLOR なしで true を返す", () => {
      expect(isDecorated()).toBe(true);
    });
  });

  describe("printHeader()", () => {
    it("decorated 時にボックス罫線を含む出力をする", () => {
      printHeader("TEST TITLE");
      const output = capturedLog();
      expect(output).toContain(BORDERS.topLeft);
      expect(output).toContain(BORDERS.topRight);
      expect(output).toContain(BORDERS.bottomLeft);
      expect(output).toContain(BORDERS.bottomRight);
      expect(output).toContain("TEST TITLE");
    });

    it("非 decorated 時に何も出力しない", () => {
      setOutputFormat("json");
      printHeader("TEST TITLE");
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("ターミナル幅 40 未満ではタイトルのみ出力", () => {
      Object.defineProperty(process.stdout, "columns", { value: 30, configurable: true });
      printHeader("TEST TITLE");
      const output = capturedLog();
      expect(output).toBe("TEST TITLE");
      expect(output).not.toContain(BORDERS.topLeft);
    });
  });

  describe("printSectionDivider()", () => {
    it("decorated 時に ═══╣ TITLE ╠═══ 形式で出力", () => {
      printSectionDivider("SECTION");
      const output = capturedLog();
      expect(output).toContain(BORDERS.titleLeft);
      expect(output).toContain("SECTION");
      expect(output).toContain(BORDERS.titleRight);
      expect(output).toContain(BORDERS.horizontal);
    });

    it("非 decorated 時にプレーンテキスト出力", () => {
      process.env.NO_COLOR = "1";
      printSectionDivider("SECTION");
      const output = capturedLog();
      expect(output).toBe("--- SECTION ---");
    });
  });

  describe("printRunResult()", () => {
    it("JSON モードで JSON 出力", () => {
      setOutputFormat("json");
      printRunResult(MOCK_RESULT);
      const output = capturedLog();
      const parsed = JSON.parse(output);
      expect(parsed.runId).toBe("run_test123");
      expect(parsed.status).toBe("completed");
    });

    it("decorated 時にパネル形式で出力される", () => {
      printRunResult(MOCK_RESULT);
      const output = capturedLog();
      expect(output).toContain(BORDERS.topLeft);
      expect(output).toContain(BORDERS.bottomRight);
      expect(output).toContain("Commission 実行結果");
      expect(output).toContain("run_test123");
      expect(output).toContain("test-commission");
    });

    it("failed 時にエラー一覧が含まれる", () => {
      printRunResult(MOCK_RESULT_FAILED);
      const output = capturedLog();
      expect(output).toContain("Errors");
      expect(output).toContain("stroke-1");
      expect(output).toContain("timeout");
    });

    it("非 decorated 時にテーブル形式で出力される", () => {
      process.env.NO_COLOR = "1";
      printRunResult(MOCK_RESULT);
      const output = capturedLog();
      expect(output).toContain("Commission 実行結果");
      expect(output).toContain("run_test123");
    });
  });

  describe("printTable()", () => {
    it("JSON モードで JSON 配列出力", () => {
      setOutputFormat("json");
      printTable(["Name", "Value"], [["a", "1"], ["b", "2"]]);
      const output = capturedLog();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].Name).toBe("a");
    });

    it("decorated 時にテーマ適用済みの chars で描画", () => {
      printTable(["Name", "Value"], [["a", "1"]]);
      const output = capturedLog();
      expect(output).toContain(BORDERS.topLeft);
      expect(output).toContain(BORDERS.bottomRight);
    });

    it("非 decorated 時にプレーンスタイルにフォールバック", () => {
      process.env.NO_COLOR = "1";
      printTable(["Name", "Value"], [["a", "1"]]);
      const output = capturedLog();
      expect(output).not.toContain(BORDERS.topLeft);
    });
  });

  describe("printSuccess()", () => {
    it("テーマシンボルを使用する", () => {
      printSuccess("done");
      const output = capturedLog();
      expect(output).toContain(SYMBOLS.success);
      expect(output).toContain("done");
    });
  });

  describe("printError()", () => {
    it("テーマシンボルを使用する", () => {
      printError("failed");
      const output = capturedError();
      expect(output).toContain(SYMBOLS.error);
      expect(output).toContain("failed");
    });
  });

  describe("printWarning()", () => {
    it("テーマシンボルを使用する", () => {
      printWarning("caution");
      const output = capturedLog();
      expect(output).toContain(SYMBOLS.warning);
      expect(output).toContain("caution");
    });
  });

  describe("printInfo()", () => {
    it("テーマシンボルを使用する", () => {
      printInfo("note");
      const output = capturedLog();
      expect(output).toContain(SYMBOLS.info);
      expect(output).toContain("note");
    });
  });

  describe("printProgressBar()", () => {
    it("[████░░░░] 形式で出力する", () => {
      printProgressBar(3, 7, "strokes");
      const output = capturedLog();
      expect(output).toContain("[");
      expect(output).toContain("]");
      expect(output).toContain("3/7");
      expect(output).toContain("strokes");
      expect(output).toContain("\u2588");
      expect(output).toContain("\u2591");
    });

    it("JSON モードで何も出力しない", () => {
      setOutputFormat("json");
      printProgressBar(3, 7);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("total=0 のとき空バー", () => {
      printProgressBar(0, 0);
      const output = capturedLog();
      expect(output).toContain("0/0");
      expect(output).toContain("\u2591".repeat(20));
    });
  });

  describe("createSpinner()", () => {
    it("Ora インスタンスを返す", () => {
      const spinner = createSpinner("loading...");
      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe("function");
      expect(typeof spinner.stop).toBe("function");
      expect(typeof spinner.fail).toBe("function");
    });
  });

  describe("--json モード", () => {
    it("全関数が ANSI エスケープを含まない", () => {
      setOutputFormat("json");
      // eslint-disable-next-line no-control-regex
      const ANSI_RE = /\x1b\[/;

      printSuccess("ok");
      printError("err");
      printWarning("warn");
      printInfo("info");
      printHeader("title");
      printSectionDivider("section");
      printProgressBar(1, 2);

      const allLog = capturedLog() + capturedError();
      expect(ANSI_RE.test(allLog)).toBe(false);
    });
  });
});
