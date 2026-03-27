/**
 * Config ポートインターフェース定義
 */

import type { StudioConfig } from "./schemas/studio.schema.js";
import type { MarkdownPaletteData } from "./markdown-loader.adapter.js";

export interface ConfigPort {
  loadStudioConfig(projectPath: string): Promise<StudioConfig>;
  loadCommission(name: string, projectPath: string): Promise<unknown>;
  loadPalette(name: string, projectPath: string): Promise<unknown>;
  loadPolicy(name: string, projectPath: string): Promise<unknown>;
  loadMarkdownPalette?(name: string, projectPath: string): Promise<MarkdownPaletteData>;
}
