/**
 * Logger ポートインターフェース定義
 */

export interface LoggerPort {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  record(event: { eventType: string; timestamp: Date; payload: unknown }): void;
}
