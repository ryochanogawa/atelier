/**
 * Logger Port
 * ロギングポート（インターフェースのみ）。
 */

import type { DomainEvent } from "../events/domain-event.js";

export interface LoggerPort {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;

  /** ドメインイベントを記録する */
  record(event: DomainEvent): void;
}
