import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeResolverService } from "../../../../src/application/services/theme-resolver.service.js";
import { BIOHAZARD_THEME } from "../../../../src/adapters/theme/biohazard.adapter.js";
import type { ThemePort } from "../../../../src/domain/ports/theme.port.js";

// ─── Mock loadNpmTheme ──────────────────────────────────────
const mockLoadNpmTheme = vi.fn<(...args: unknown[]) => Promise<ThemePort>>();

vi.mock("../../../../src/adapters/theme/theme-loader.adapter.js", () => ({
  loadNpmTheme: (...args: unknown[]) => mockLoadNpmTheme(...args),
}));

// ─── Mock Logger ────────────────────────────────────────────
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  record: vi.fn(),
};

const CUSTOM_THEME: ThemePort = {
  ...BIOHAZARD_THEME,
  meta: { name: "custom", displayName: "Custom", version: "1.0.0" },
  colors: { ...BIOHAZARD_THEME.colors, primary: "#00FF00" },
};

describe("ThemeResolverService", () => {
  let service: ThemeResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ThemeResolverService();
    mockLoadNpmTheme.mockResolvedValue(BIOHAZARD_THEME);
  });

  it("undefined のとき BIOHAZARD_THEME を返す", async () => {
    const result = await service.resolve(undefined, mockLogger);
    expect(result).toBe(BIOHAZARD_THEME);
    expect(mockLoadNpmTheme).not.toHaveBeenCalled();
  });

  it("空文字のとき BIOHAZARD_THEME を返す", async () => {
    const result = await service.resolve("", mockLogger);
    expect(result).toBe(BIOHAZARD_THEME);
  });

  it("'biohazard' のときビルトインテーマを返す", async () => {
    const result = await service.resolve("biohazard", mockLogger);
    expect(result).toBe(BIOHAZARD_THEME);
    expect(mockLoadNpmTheme).not.toHaveBeenCalled();
  });

  it("カスタム名のとき atelier-theme-${name} のコンベンションで試行する", async () => {
    mockLoadNpmTheme.mockResolvedValueOnce(CUSTOM_THEME);

    const result = await service.resolve("mgs", mockLogger);

    expect(result).toBe(CUSTOM_THEME);
    expect(mockLoadNpmTheme).toHaveBeenCalledWith("atelier-theme-mgs", mockLogger);
  });

  it("コンベンション名で見つからない場合フルネームで試行する", async () => {
    // 1回目(convention): BIOHAZARD_THEME(フォールバック) → 2回目(full): CUSTOM_THEME
    mockLoadNpmTheme
      .mockResolvedValueOnce(BIOHAZARD_THEME)
      .mockResolvedValueOnce(CUSTOM_THEME);

    const result = await service.resolve("my-custom-theme", mockLogger);

    expect(result).toBe(CUSTOM_THEME);
    expect(mockLoadNpmTheme).toHaveBeenCalledTimes(2);
    expect(mockLoadNpmTheme).toHaveBeenNthCalledWith(1, "atelier-theme-my-custom-theme", mockLogger);
    expect(mockLoadNpmTheme).toHaveBeenNthCalledWith(2, "my-custom-theme", mockLogger);
  });

  it("両方見つからない場合 BIOHAZARD_THEME にフォールバックする", async () => {
    mockLoadNpmTheme.mockResolvedValue(BIOHAZARD_THEME);

    const result = await service.resolve("nonexistent", mockLogger);

    expect(result).toBe(BIOHAZARD_THEME);
  });

  it("atelier-theme-* 形式のフルネームの場合、コンベンション試行のみ", async () => {
    // "atelier-theme-mgs" → convention = "atelier-theme-atelier-theme-mgs"
    // convention 試行で BIOHAZARD 返却 → fullname "atelier-theme-mgs" で再試行
    mockLoadNpmTheme
      .mockResolvedValueOnce(BIOHAZARD_THEME)
      .mockResolvedValueOnce(CUSTOM_THEME);

    const result = await service.resolve("atelier-theme-mgs", mockLogger);

    expect(result).toBe(CUSTOM_THEME);
    expect(mockLoadNpmTheme).toHaveBeenCalledTimes(2);
  });
});
