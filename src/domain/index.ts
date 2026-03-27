/**
 * Domain Layer - Barrel Export
 * 全ドメインモジュールの再エクスポート。
 */

// Value Objects
export {
  FacetKind,
  type Facet,
  createFacet,
} from "./value-objects/facet.vo.js";

export {
  StrokeStatus,
  isValidStrokeTransition,
} from "./value-objects/stroke-status.vo.js";

export {
  CommissionStatus,
  isValidCommissionTransition,
} from "./value-objects/commission-status.vo.js";

export {
  type Transition,
  type OnMaxRetriesAction,
  createTransition,
} from "./value-objects/transition.vo.js";

export {
  CritiqueVerdict,
  type CritiqueIssue,
  createCritiqueIssue,
} from "./value-objects/critique-verdict.vo.js";

export type {
  MediumRequest,
  MediumResponse,
  MediumUsage,
  MediumFinishReason,
} from "./value-objects/medium-config.vo.js";

// Models
export {
  type Palette,
  type PaletteDefaults,
  createPalette,
} from "./models/palette.model.js";

export { Canvas } from "./models/canvas.model.js";

export {
  Stroke,
  type StrokeDefinition,
} from "./models/stroke.model.js";

export {
  type Critique,
  createCritique,
} from "./models/critique.model.js";

// Aggregates
export {
  Commission,
  type CommissionParams,
} from "./aggregates/commission.aggregate.js";

export {
  RunContext,
  type StrokeExecution,
} from "./aggregates/run-context.aggregate.js";

// Domain Services
export {
  Easel,
  type EaselDeps,
} from "./services/easel.service.js";

export {
  PromptComposer,
  type ComposedPrompt,
  type PromptComposerDeps,
} from "./services/prompt-composer.service.js";

export {
  CritiqueService,
  type CritiqueRule,
} from "./services/critique.service.js";

// Ports
export type { MediumPort } from "./ports/medium.port.js";
export type { VcsPort } from "./ports/vcs.port.js";
export type { LoggerPort } from "./ports/logger.port.js";
export type {
  ConfigPort,
  StudioConfig,
  MediumConfig,
  CommissionConfig,
  StrokeConfig,
  TransitionConfig,
} from "./ports/config.port.js";

// Events
export type { DomainEvent } from "./events/domain-event.js";
export { createEventId } from "./events/domain-event.js";

export type {
  CommissionStarted,
  CommissionCompleted,
  CommissionFailed,
  CommissionAborted,
  CommissionStartedPayload,
  CommissionCompletedPayload,
  CommissionFailedPayload,
  CommissionAbortedPayload,
} from "./events/commission-events.js";
export {
  commissionStarted,
  commissionCompleted,
  commissionFailed,
  commissionAborted,
} from "./events/commission-events.js";

export type {
  StrokeStarted,
  StrokeCompleted,
  StrokeFailed,
  StrokeRetried,
  StrokeStartedPayload,
  StrokeCompletedPayload,
  StrokeFailedPayload,
  StrokeRetriedPayload,
} from "./events/stroke-events.js";
export {
  strokeStarted,
  strokeCompleted,
  strokeFailed,
  strokeRetried,
} from "./events/stroke-events.js";

// Errors
export {
  AtelierError,
  CommissionError,
  StrokeError,
  MediumError,
  ConfigError,
  TransitionError,
} from "./errors/atelier-error.js";
