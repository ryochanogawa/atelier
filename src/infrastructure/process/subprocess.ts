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

/** SIGTERM後に強制終了するまでの待機時間 (ms) */
const SIGKILL_DELAY_MS = 5000;

/**
 * プロセスにSIGTERMを送信し、指定時間内に終了しない場合はSIGKILLで強制終了する。
 */
async function killGracefully(proc: ResultPromise): Promise<void> {
  try {
    proc.kill("SIGTERM");
  } catch {
    // プロセスがすでに終了している場合は無視
    return;
  }

  const killTimer = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // プロセスがすでに終了している場合は無視
    }
  }, SIGKILL_DELAY_MS);

  try {
    await proc;
  } catch {
    // タイムアウト後のプロセス終了によるエラーは無視
  } finally {
    clearTimeout(killTimer);
  }
}

/**
 * コマンドを実行し、結果を返す。
 * タイムアウトおよびリトライをサポートする。
 * タイムアウト時はSIGTERMを送信し、5秒後もプロセスが生存していればSIGKILLで強制終了する。
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
        reject: false,
        ...(stdin !== undefined ? { input: stdin } : {}),
      };

      const proc = execa(command, [...args], execaOptions);

      const timeoutHandle = setTimeout(() => {
        void killGracefully(proc);
      }, timeout);

      let result: Awaited<typeof proc>;
      try {
        result = await proc;
      } finally {
        clearTimeout(timeoutHandle);
      }

      const duration = Date.now() - startTime;

      // タイムアウトによる強制終了を検出してエラーとして扱う
      if (result.timedOut === true) {
        throw new Error(`Process timed out after ${timeout}ms: ${command}`);
      }

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
