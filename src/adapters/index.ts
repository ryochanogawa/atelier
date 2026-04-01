/**
 * Adapters Layer - 全エクスポート
 */

// Medium adapters
export {
  ClaudeCodeAdapter,
  CodexAdapter,
  GeminiAdapter,
  MediumRegistry,
  createDefaultRegistry,
  type MediumPort,
  type MediumAvailability,
  type MediumRequest,
  type MediumResponse,
  type MediumAvailabilityReport,
} from "./medium/index.js";

// VCS adapters
export { GitAdapter, type VcsPort } from "./vcs/index.js";

// Config adapters
export {
  YamlLoaderAdapter,
  StudioConfigSchema,
  MediumConfigSchema,
  StrokeConfigSchema,
  CommissionSchema,
  FacetSchema,
  CritiqueSchema,
  PaletteSchema,
  PaletteEntrySchema,
  type ConfigPort,
  type StudioConfig,
  type MediumConfig,
  type StrokeConfig,
  type Commission,
  type Facet,
  type Critique,
  type Palette,
  type PaletteEntry,
} from "./config/index.js";

// Logger adapters
export {
  NdjsonLoggerAdapter,
  ConsoleLoggerAdapter,
  type LoggerPort,
} from "./logger/index.js";

// Theme adapters
export {
  BIOHAZARD_THEME,
  loadNpmTheme,
  ThemePortSchema,
} from "./theme/index.js";
