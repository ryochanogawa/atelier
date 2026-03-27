/**
 * Console Logger アダプター
 * chalk を使用して人間向けのカラー付きコンソール出力を行う。
 */

import chalk from "chalk";
import type { LoggerPort } from "./types.js";

export class ConsoleLoggerAdapter implements LoggerPort {
  info(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : "";
    console.log(`${chalk.blue("ℹ")} ${chalk.blue(message)}${chalk.gray(suffix)}`);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : "";
    console.warn(
      `${chalk.yellow("⚠")} ${chalk.yellow(message)}${chalk.gray(suffix)}`,
    );
  }

  error(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : "";
    console.error(
      `${chalk.red("✖")} ${chalk.red(message)}${chalk.gray(suffix)}`,
    );
  }

  debug(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : "";
    console.debug(
      `${chalk.gray("●")} ${chalk.gray(message)}${chalk.gray(suffix)}`,
    );
  }

  record(event: { eventType: string; timestamp: Date; payload: unknown }): void {
    console.log(
      `${chalk.magenta("◆")} ${chalk.magenta(`[${event.eventType}]`)} ${chalk.gray(event.timestamp.toISOString())}`,
    );
  }
}
