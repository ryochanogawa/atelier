import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveRenderMode,
  initializeRenderMode,
  getRenderMode,
  isTuiMode,
  setOutputFormat,
  getOutputFormat,
  initializeTheme,
  getCurrentTheme,
  getColorFn,
  printHeader,
  printSectionDivider,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  printRunResult,
  printProgressBar,
} from "../../../src/cli/output.js";
import { BIOHAZARD_THEME } from "../../../src/adapters/theme/biohazard.adapter.js";
import type { ThemePort } from "../../../src/domain/ports/theme.port.js";
import type { RunResultDto } from "../../../src/application/dto/run-result.dto.js";

// ─── TUI モジュールモック ────────────────────────────────────
const mockRenderStatic = vi.fn();

vi.mock("../../../src/cli/tui/render.js", () => ({
  renderStatic: (...args: unknown[]) => mockRenderStatic(...args),
  renderPersistent: vi.fn(),
  unmountInk: vi.fn(),
  waitForExit: vi.fn(),
}));

const mockHeader = vi.fn(() => null);
const mockSectionDivider = vi.fn(() => null);
const mockDataTable = vi.fn(() => null);
const mockProgressBar = vi.fn(() => null);
const mockRunResult = vi.fn(() => null);
const mockSuccessMessage = vi.fn(() => null);
const mockErrorMessage = vi.fn(() => null);
const mockWarningMessage = vi.fn(() => null);
const mockInfoMessage = vi.fn(() => null);

vi.mock("../../../src/cli/tui/index.js", () => ({
  App: vi.fn(),
  ThemeProvider: vi.fn(),
  useTheme: vi.fn(),
  Header: (...args: unknown[]) => mockHeader(...args),
  SectionDivider: (...args: unknown[]) => mockSectionDivider(...args),
  DataTable: (...args: unknown[]) => mockDataTable(...args),
  Spinner: vi.fn(),
  ProgressBar: (...args: unknown[]) => mockProgressBar(...args),
  RunResult: (...args: unknown[]) => mockRunResult(...args),
  SuccessMessage: (...args: unknown[]) => mockSuccessMessage(...args),
  ErrorMessage: (...args: unknown[]) => mockErrorMessage(...args),
  WarningMessage: (...args: unknown[]) => mockWarningMessage(...args),
  InfoMessage: (...args: unknown[]) => mockInfoMessage(...args),
  renderStatic: (...args: unknown[]) => mockRenderStatic(...args),
  renderPersistent: vi.fn(),
  unmountInk: vi.fn(),
  waitForExit: vi.fn(),
}));

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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

describe("output.ts — RenderMode", () => {
  let originalIsTTY: boolean | undefined;
  let originalNoColor: string | undefined;
  let originalCI: string | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
    mockRenderStatic.mockClear();
    originalIsTTY = process.stdout.isTTY;
    originalNoColor = process.env.NO_COLOR;
    originalCI = process.env.CI;
    originalColumns = process.stdout.columns;
    delete process.env.NO_COLOR;
    delete process.env.CI;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
    // classic モードにリセット
    setOutputFormat("table");
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  // ─── resolveRenderMode ──────────────────────────────────────

  describe("resolveRenderMode()", () => {
    it("json: true のとき 'json' を返す", () => {
      expect(resolveRenderMode({ json: true, noTui: false })).toBe("json");
    });

    it("noTui: true のとき 'classic' を返す", () => {
      expect(resolveRenderMode({ json: false, noTui: true })).toBe("classic");
    });

    it("json と noTui の両方が true なら json が優先される", () => {
      expect(resolveRenderMode({ json: true, noTui: true })).toBe("json");
    });

    it("NO_COLOR 環境変数が設定されていれば 'classic' を返す", () => {
      process.env.NO_COLOR = "1";
      expect(resolveRenderMode({ json: false, noTui: false })).toBe("classic");
    });

    it("CI 環境変数が設定されていれば 'classic' を返す", () => {
      process.env.CI = "true";
      expect(resolveRenderMode({ json: false, noTui: false })).toBe("classic");
    });

    it("非 TTY のとき 'classic' を返す", () => {
      Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
      expect(resolveRenderMode({ json: false, noTui: false })).toBe("classic");
    });

    it("TTY かつオプションなしで 'tui' を返す", () => {
      expect(resolveRenderMode({ json: false, noTui: false })).toBe("tui");
    });
  });

  // ─── initializeRenderMode ───────────────────────────────────

  describe("initializeRenderMode()", () => {
    it("'classic' モードで初期化すると getRenderMode が classic を返す", async () => {
      await initializeRenderMode("classic");
      expect(getRenderMode()).toBe("classic");
      expect(isTuiMode()).toBe(false);
    });

    it("'json' モードで初期化すると outputFormat も json になる", async () => {
      await initializeRenderMode("json");
      expect(getRenderMode()).toBe("json");
      expect(getOutputFormat()).toBe("json");
    });

    it("'tui' モードで初期化すると isTuiMode() が true を返す", async () => {
      await initializeRenderMode("tui");
      expect(getRenderMode()).toBe("tui");
      expect(isTuiMode()).toBe(true);
    });

    it("'classic' モードでは TUI モジュールをロードしない", async () => {
      await initializeRenderMode("classic");
      // classic モードなので TUI コンポーネントは使われない
      expect(isTuiMode()).toBe(false);
    });
  });

  // ─── setOutputFormat と renderMode の連動 ───────────────────

  describe("setOutputFormat() — renderMode 連動", () => {
    it("json に設定すると renderMode も json になる", () => {
      setOutputFormat("json");
      expect(getRenderMode()).toBe("json");
      expect(getOutputFormat()).toBe("json");
    });

    it("json → table に戻すと renderMode が classic になる", () => {
      setOutputFormat("json");
      setOutputFormat("table");
      expect(getRenderMode()).toBe("classic");
      expect(getOutputFormat()).toBe("table");
    });

    it("classic モードで table に設定しても renderMode は classic のまま", async () => {
      await initializeRenderMode("classic");
      setOutputFormat("table");
      expect(getRenderMode()).toBe("classic");
    });
  });

  // ─── Theme 管理 ────────────────────────────────────────────

  describe("initializeTheme() / getCurrentTheme() / getColorFn()", () => {
    it("デフォルトテーマは BIOHAZARD_THEME", () => {
      const theme = getCurrentTheme();
      expect(theme.meta.name).toBe("biohazard");
    });

    it("initializeTheme でテーマを切り替えられる", () => {
      // Arrange
      const customTheme: ThemePort = {
        ...BIOHAZARD_THEME,
        meta: { ...BIOHAZARD_THEME.meta, name: "custom", displayName: "Custom" },
        colors: { ...BIOHAZARD_THEME.colors, primary: "#00FF00" },
      };

      // Act
      initializeTheme(customTheme);

      // Assert
      expect(getCurrentTheme().meta.name).toBe("custom");
      expect(getCurrentTheme().colors.primary).toBe("#00FF00");

      // Cleanup — 元に戻す
      initializeTheme(BIOHAZARD_THEME);
    });

    it("getColorFn が ChalkInstance を返す", () => {
      const fn = getColorFn("primary");
      expect(typeof fn).toBe("function");
      // chalk 関数は文字列を受け取って文字列を返す
      const result = fn("test");
      expect(typeof result).toBe("string");
    });

    it("テーマ変更後に getColorFn が新しいカラーを反映する", () => {
      // Arrange
      const customTheme: ThemePort = {
        ...BIOHAZARD_THEME,
        meta: { ...BIOHAZARD_THEME.meta, name: "test-color" },
        colors: { ...BIOHAZARD_THEME.colors, primary: "#FFFFFF" },
      };

      // Act
      initializeTheme(customTheme);
      const fn = getColorFn("primary");
      const result = fn("hello");

      // Assert — chalk.hex("#FFFFFF") で着色された文字列
      expect(result).toContain("hello");

      // Cleanup
      initializeTheme(BIOHAZARD_THEME);
    });
  });

  // ─── TUI モード時の print 関数分岐 ─────────────────────────

  describe("TUI モード時の出力分岐", () => {
    beforeEach(async () => {
      await initializeRenderMode("tui");
    });

    afterEach(async () => {
      // classic に戻す
      await initializeRenderMode("classic");
    });

    it("printHeader が renderStatic 経由で TUI コンポーネントを描画する", () => {
      printHeader("TUI TITLE");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("printSectionDivider が renderStatic を使用する", () => {
      printSectionDivider("SECTION");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });

    it("printSuccess が renderStatic を使用する", () => {
      printSuccess("done");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("printError が renderStatic を使用する", () => {
      printError("failed");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("printWarning が renderStatic を使用する", () => {
      printWarning("caution");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });

    it("printInfo が renderStatic を使用する", () => {
      printInfo("note");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });

    it("printTable が renderStatic を使用する", () => {
      printTable(["A", "B"], [["1", "2"]]);
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });

    it("printRunResult が renderStatic を使用する", () => {
      printRunResult(MOCK_RESULT);
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });

    it("printProgressBar が renderStatic を使用する", () => {
      printProgressBar(3, 10, "strokes");
      expect(mockRenderStatic).toHaveBeenCalledOnce();
    });
  });

  // ─── JSON モード時は TUI を使わない ─────────────────────────

  describe("JSON モード時は TUI を使わない", () => {
    beforeEach(async () => {
      await initializeRenderMode("json");
    });

    afterEach(async () => {
      await initializeRenderMode("classic");
    });

    it("printHeader は何も出力しない", () => {
      printHeader("TITLE");
      expect(mockRenderStatic).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("printSectionDivider は何も出力しない", () => {
      printSectionDivider("SEC");
      expect(mockRenderStatic).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("printProgressBar は何も出力しない", () => {
      printProgressBar(1, 5);
      expect(mockRenderStatic).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("printRunResult は JSON を出力する", () => {
      printRunResult(MOCK_RESULT);
      expect(mockRenderStatic).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(output);
      expect(parsed.runId).toBe("run_test123");
    });

    it("printTable は JSON 配列を出力する", () => {
      printTable(["Name"], [["val"]]);
      expect(mockRenderStatic).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(output);
      expect(parsed[0].Name).toBe("val");
    });
  });
});
