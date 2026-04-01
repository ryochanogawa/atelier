/**
 * Theme Loader Adapter
 * npm パッケージからテーマを動的ロードし、Zod バリデーションで検証する。
 */

import type { ThemePort } from "../../domain/ports/theme.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { ThemePortSchema } from "./theme.schema.js";
import { BIOHAZARD_THEME } from "./biohazard.adapter.js";

async function tryImport(packageName: string): Promise<unknown> {
  const mod: unknown = await import(packageName);
  if (
    typeof mod === "object" &&
    mod !== null &&
    "default" in mod
  ) {
    return (mod as { default: unknown }).default;
  }
  return mod;
}

export async function loadNpmTheme(
  packageName: string,
  logger: LoggerPort,
): Promise<ThemePort> {
  try {
    const raw = await tryImport(packageName);
    const result = ThemePortSchema.safeParse(raw);
    if (!result.success) {
      logger.warn(
        `テーマ "${packageName}" は ThemePort スキーマに適合しません。デフォルトにフォールバックします。`,
        { errors: result.error.flatten().fieldErrors },
      );
      return BIOHAZARD_THEME;
    }
    return result.data as ThemePort;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `テーマ "${packageName}" の読み込みに失敗しました。デフォルトにフォールバックします。`,
      { error: message },
    );
    return BIOHAZARD_THEME;
  }
}
