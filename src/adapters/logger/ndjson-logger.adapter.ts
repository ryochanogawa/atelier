/**
 * NDJSON Logger アダプター
 * pino を使用して .atelier/logs/ にNDJSON形式でログを出力する。
 */

import pino, { type Logger } from "pino";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { LoggerPort } from "./types.js";

export class NdjsonLoggerAdapter implements LoggerPort {
  private readonly logger: Logger;

  constructor(projectPath: string, logFileName?: string) {
    const logDir = join(projectPath, ".atelier", "logs");
    mkdirSync(logDir, { recursive: true });

    const fileName =
      logFileName ?? `atelier-${new Date().toISOString().slice(0, 10)}.ndjson`;
    const logPath = join(logDir, fileName);

    this.logger = pino(
      {
        level: "debug",
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.destination({ dest: logPath, sync: false }),
    );
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data ?? {}, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(data ?? {}, message);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(data ?? {}, message);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(data ?? {}, message);
  }

  record(event: { eventType: string; timestamp: Date; payload: unknown }): void {
    this.logger.info(
      {
        eventType: event.eventType,
        eventTimestamp: event.timestamp.toISOString(),
        payload: event.payload,
      },
      `event:${event.eventType}`,
    );
  }
}
