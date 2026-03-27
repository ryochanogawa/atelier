/**
 * Atelier Domain Errors
 * ドメイン層の例外階層。
 */

export class AtelierError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AtelierError";
    this.code = code;
  }
}

export class CommissionError extends AtelierError {
  readonly commissionName: string;

  constructor(
    commissionName: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super("COMMISSION_ERROR", `[Commission: ${commissionName}] ${message}`, options);
    this.name = "CommissionError";
    this.commissionName = commissionName;
  }
}

export class StrokeError extends AtelierError {
  readonly strokeName: string;

  constructor(strokeName: string, message: string, options?: ErrorOptions) {
    super("STROKE_ERROR", `[Stroke: ${strokeName}] ${message}`, options);
    this.name = "StrokeError";
    this.strokeName = strokeName;
  }
}

export class MediumError extends AtelierError {
  readonly mediumName?: string;

  constructor(message: string, mediumName?: string, options?: ErrorOptions) {
    super(
      "MEDIUM_ERROR",
      mediumName ? `[Medium: ${mediumName}] ${message}` : message,
      options,
    );
    this.name = "MediumError";
    this.mediumName = mediumName;
  }
}

export class ConfigError extends AtelierError {
  constructor(message: string, options?: ErrorOptions) {
    super("CONFIG_ERROR", message, options);
    this.name = "ConfigError";
  }
}

export class TransitionError extends AtelierError {
  readonly fromStroke: string;
  readonly toStroke: string;

  constructor(
    fromStroke: string,
    toStroke: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      "TRANSITION_ERROR",
      `[Transition: ${fromStroke} -> ${toStroke}] ${message}`,
      options,
    );
    this.name = "TransitionError";
    this.fromStroke = fromStroke;
    this.toStroke = toStroke;
  }
}
