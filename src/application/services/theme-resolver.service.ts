/**
 * Theme Resolver Service
 * テーマ名から ThemePort を解決する。npm 動的ロード + フォールバック。
 */

import type { ThemePort } from "../../domain/ports/theme.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { BIOHAZARD_THEME } from "../../adapters/theme/biohazard.adapter.js";
import { CODEC_THEME } from "../../adapters/theme/codec.adapter.js";
import { loadNpmTheme } from "../../adapters/theme/theme-loader.adapter.js";

const BUILTIN_THEMES: ReadonlyMap<string, ThemePort> = new Map([
  ["biohazard", BIOHAZARD_THEME],
  ["codec", CODEC_THEME],
]);

export class ThemeResolverService {
  /**
   * テーマ名から ThemePort を解決する。
   * - undefined/空文字 → デフォルト(biohazard)
   * - ビルトイン名 → 対応するビルトインテーマ
   * - それ以外 → npm 動的ロード（atelier-theme-${name} → フルネーム）
   * - ロード失敗 → デフォルトにフォールバック + 警告ログ
   */
  async resolve(
    themeName: string | undefined,
    logger: LoggerPort,
  ): Promise<ThemePort> {
    if (!themeName || themeName === "") {
      return BIOHAZARD_THEME;
    }

    const builtin = BUILTIN_THEMES.get(themeName);
    if (builtin) {
      return builtin;
    }

    // atelier-theme-${name} のコンベンションを先に試行
    const conventionName = `atelier-theme-${themeName}`;
    const theme = await loadNpmTheme(conventionName, logger);
    if (theme !== BIOHAZARD_THEME) {
      return theme;
    }

    // フルパッケージ名として試行
    if (themeName !== conventionName) {
      return loadNpmTheme(themeName, logger);
    }

    return BIOHAZARD_THEME;
  }
}
