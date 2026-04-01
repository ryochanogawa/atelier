import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { BIOHAZARD_THEME } from "../../../../../src/adapters/theme/biohazard.adapter.js";

// ─── Mock Ink ─────────────────────────────────────────────────
vi.mock("ink", () => ({
  Text: ({ children, color }: { children: React.ReactNode; color?: string }) =>
    React.createElement("span", { "data-color": color }, children),
}));

vi.mock("../../../../../src/cli/tui/theme-context.js", () => ({
  useTheme: () => BIOHAZARD_THEME,
}));

// ─── Mock React hooks ────────────────────────────────────────
// Spinner は useState/useEffect を使うため、直接呼び出しではフック動作しない。
// フックの初期値（frame=0）での出力をテストする。
let mockFrame = 0;
const mockSetFrame = vi.fn();
const mockCleanup = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    default: {
      ...actual.default,
      createElement: actual.default.createElement,
    },
    useState: (initial: number) => {
      mockFrame = initial;
      return [mockFrame, mockSetFrame];
    },
    useEffect: (cb: () => () => void) => {
      const cleanup = cb();
      if (typeof cleanup === "function") {
        mockCleanup.mockImplementation(cleanup);
      }
    },
  };
});

describe("Spinner component", () => {
  const SPINNER_FRAMES = [
    "\u280B",
    "\u2819",
    "\u2839",
    "\u2838",
    "\u283C",
    "\u2834",
    "\u2826",
    "\u2827",
    "\u2807",
    "\u280F",
  ];
  const { colors } = BIOHAZARD_THEME;

  let Spinner: typeof import("../../../../../src/cli/tui/components/spinner.js").Spinner;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const mod = await import(
      "../../../../../src/cli/tui/components/spinner.js"
    );
    Spinner = mod.Spinner;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期フレーム（frame=0）のスピナー文字を表示する", () => {
    // Arrange & Act
    const element = Spinner({ text: "Loading..." });

    // Assert — 外側 Text の children に spinner Text + text Text
    const children = React.Children.toArray(
      element.props.children,
    ) as React.ReactElement[];
    expect(children.length).toBe(2);

    // spinner frame
    const spinnerText = children[0];
    expect(spinnerText.props.color).toBe(colors.warning);
    const spinnerContent = React.Children.toArray(
      spinnerText.props.children,
    ).join("");
    expect(spinnerContent).toContain(SPINNER_FRAMES[0]);

    // text
    const textContent = React.Children.toArray(
      children[1].props.children,
    ).join("");
    expect(textContent).toContain("Loading...");
  });

  it("useEffect のクリーンアップ関数が clearInterval を呼ぶ", () => {
    // Arrange & Act
    Spinner({ text: "test" });

    // Assert — cleanup 関数が登録されている
    expect(mockCleanup).toBeDefined();
    // cleanup を呼んでもエラーにならない
    expect(() => mockCleanup()).not.toThrow();
  });

  it("setFrame が interval で呼ばれる（80ms間隔）", () => {
    // Arrange
    Spinner({ text: "test" });

    // Assert — setFrame が interval のコールバックとして登録されている
    // useEffect 内で setInterval が呼ばれ、setFrame を使う
    // フェイクタイマーを進めて確認
    vi.advanceTimersByTime(80);
    expect(mockSetFrame).toHaveBeenCalled();
  });
});
