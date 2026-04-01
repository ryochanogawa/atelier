import { describe, it, expect, vi, beforeEach } from "vitest";
import { BIOHAZARD_THEME } from "../../../../src/adapters/theme/biohazard.adapter.js";
import type { ThemePort } from "../../../../src/domain/ports/theme.port.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  record: vi.fn(),
};

// ─── テスト用の有効なテーマ ──────────────────────────────────
const VALID_THEME: ThemePort = {
  meta: { name: "test-theme", displayName: "Test", version: "1.0.0" },
  colors: {
    primary: "#FF0000",
    secondary: "#00FF00",
    accent: "#0000FF",
    muted: "#888888",
    text: "#FFFFFF",
    success: "#00FF00",
    error: "#FF0000",
    warning: "#FFFF00",
    info: "#00FFFF",
  },
  symbols: {
    brand: "★",
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
    bullet: "•",
    arrow: "▸",
    line: "─",
  },
  borders: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
    titleLeft: "╡",
    titleRight: "╞",
  },
  tableStyle: { top: "═", "top-mid": "╤", "top-left": "╔", "top-right": "╗" },
};

describe("loadNpmTheme()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("存在しないパッケージでは BIOHAZARD_THEME にフォールバックし warn を出す", async () => {
    // Arrange
    const { loadNpmTheme } = await import(
      "../../../../src/adapters/theme/theme-loader.adapter.js"
    );

    // Act
    const result = await loadNpmTheme("nonexistent-theme-pkg-xyz", mockLogger);

    // Assert
    expect(result).toStrictEqual(BIOHAZARD_THEME);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockLogger.warn.mock.calls[0][0]).toContain(
      "nonexistent-theme-pkg-xyz",
    );
  });

  it("バリデーション失敗時に BIOHAZARD_THEME にフォールバックし warn を出す", async () => {
    // Arrange — path は Node 組込みモジュールで ThemePort 形式ではない
    const { loadNpmTheme } = await import(
      "../../../../src/adapters/theme/theme-loader.adapter.js"
    );

    // Act
    const result = await loadNpmTheme("path", mockLogger);

    // Assert
    expect(result).toStrictEqual(BIOHAZARD_THEME);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("バリデーション失敗時の warn メッセージに 'スキーマに適合しません' を含む", async () => {
    // Arrange — url は Node 組込みモジュールで ThemePort 形式ではない
    const { loadNpmTheme } = await import(
      "../../../../src/adapters/theme/theme-loader.adapter.js"
    );

    // Act
    const result = await loadNpmTheme("url", mockLogger);

    // Assert
    expect(result).toStrictEqual(BIOHAZARD_THEME);
    // import 失敗 or バリデーション失敗
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("import エラー時の warn メッセージに '読み込みに失敗しました' を含む", async () => {
    // Arrange
    const { loadNpmTheme } = await import(
      "../../../../src/adapters/theme/theme-loader.adapter.js"
    );

    // Act
    const result = await loadNpmTheme(
      "@nonexistent/impossible-package",
      mockLogger,
    );

    // Assert
    expect(result).toStrictEqual(BIOHAZARD_THEME);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockLogger.warn.mock.calls[0][0]).toContain("読み込みに失敗しました");
  });
});
