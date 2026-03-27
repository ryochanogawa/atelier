/**
 * Subprocess
 * execa ラッパー。タイムアウト・リトライロジックを提供する。
 */

import { execa, type Options as ExecaOptions, type ResultPromise } from "execa";
import { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from "../../shared/constants.js";

export interface SubprocessOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly timeout?: number;
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly stdin?: string;
}

export interface SubprocessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly duration: number;
}

/**
 * コマンドを実行し、結果を返す。
 * タイムアウトおよびリトライをサポートする。
 */
export async function runSubprocess(
  command: string,
  args: readonly string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  const {
    cwd,
    env,
    timeout = DEFAULT_TIMEOUT_MS,
    maxRetries = 0,
    retryDelay = 1000,
    stdin,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const execaOptions: ExecaOptions = {
        cwd,
        env,
        timeout,
        reject: false,
        ...(stdin !== undefined ? { input: stdin } : {}),
      };

      const result = await execa(command, [...args], execaOptions);
      const duration = Date.now() - startTime;

      return {
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
        exitCode: result.exitCode ?? 1,
        duration,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await sleep(retryDelay * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Failed to execute: ${command}`);
}

/**
 * コマンドの存在確認を行う。
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const result = await execa("which", [command], {
      reject: false,
      timeout: 5000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
