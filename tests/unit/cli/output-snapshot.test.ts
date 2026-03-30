import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setOutputFormat,
  printHeader,
  printRunResult,
  printTable,
} from "../../../src/cli/output.js";
import type { RunResultDto } from "../../../src/application/dto/run-result.dto.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function capturedPlainLog(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n").replace(ANSI_RE, "");
}

const MOCK_RESULT: RunResultDto = {
  runId: "run_snapshot",
  commissionName: "snapshot-commission",
  status: "completed",
  strokesExecuted: 2,
  strokesTotal: 3,
  duration: 5000,
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:00:05Z",
  errors: [],
};

describe("output snapshot tests", () => {
  let originalIsTTY: boolean | undefined;
  let originalNoColor: string | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    logSpy.mockClear();
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

  it("printHeader スナップショット", () => {
    printHeader("ATELIER v0.1.0");
    expect(capturedPlainLog()).toMatchSnapshot();
  });

  it("printRunResult (completed) スナップショット", () => {
    printRunResult(MOCK_RESULT);
    expect(capturedPlainLog()).toMatchSnapshot();
  });

  it("printRunResult (failed) スナップショット", () => {
    printRunResult({
      ...MOCK_RESULT,
      status: "failed",
      errors: [{ strokeName: "s1", message: "error msg", timestamp: "2026-01-01T00:00:03Z" }],
    });
    expect(capturedPlainLog()).toMatchSnapshot();
  });

  it("printTable スナップショット", () => {
    printTable(["Name", "Status"], [["task-1", "done"], ["task-2", "pending"]]);
    expect(capturedPlainLog()).toMatchSnapshot();
  });

  it("NO_COLOR フォールバック: printRunResult スナップショット", () => {
    process.env.NO_COLOR = "1";
    printRunResult(MOCK_RESULT);
    expect(capturedPlainLog()).toMatchSnapshot();
  });
});
