/**
 * ATELIER - AI Agent Orchestration CLI
 * パッケージのメインエクスポート。
 */

// Domain
export { Canvas } from "./domain/models/canvas.model.js";
export { Stroke, type StrokeDefinition } from "./domain/models/stroke.model.js";
export { type Palette, createPalette } from "./domain/models/palette.model.js";
export { type Critique, createCritique } from "./domain/models/critique.model.js";
export { CommissionStatus, isValidCommissionTransition } from "./domain/value-objects/commission-status.vo.js";
export { StrokeStatus, isValidStrokeTransition } from "./domain/value-objects/stroke-status.vo.js";
export { type Facet, FacetKind, createFacet } from "./domain/value-objects/facet.vo.js";
export { type Transition, createTransition } from "./domain/value-objects/transition.vo.js";
export { type CritiqueVerdict, type CritiqueIssue, createCritiqueIssue } from "./domain/value-objects/critique-verdict.vo.js";
export { type MediumInferenceConfig, type MediumInferenceResponse, type MediumUsage } from "./domain/value-objects/medium-config.vo.js";
export { AtelierError, CommissionError, StrokeError, MediumError, ConfigError } from "./domain/errors/atelier-error.js";
export { type DomainEvent, createEventId } from "./domain/events/domain-event.js";

// Application
export { CommissionRunUseCase } from "./application/use-cases/run-commission.use-case.js";
export { CommissionValidateUseCase } from "./application/use-cases/validate-commission.use-case.js";
export { MediumCheckUseCase } from "./application/use-cases/check-medium.use-case.js";
export { StudioInitUseCase } from "./application/use-cases/init-studio.use-case.js";
export { CommissionRunnerService } from "./application/services/commission-runner.service.js";
export { type RunResultDto, createRunResultDto } from "./application/dto/run-result.dto.js";

// Shared
export * from "./shared/types.js";
export * from "./shared/constants.js";
export { generateRunId, formatDuration, resolveAtelierPath } from "./shared/utils.js";

// Infrastructure
export { runSubprocess, isCommandAvailable } from "./infrastructure/process/subprocess.js";
export { TypedEventEmitter, createEventBus, type AtelierEvents } from "./infrastructure/event-bus/event-emitter.js";
export { ensureDir, fileExists, dirExists, readTextFile, writeTextFile, listFiles } from "./infrastructure/fs/file-system.js";
