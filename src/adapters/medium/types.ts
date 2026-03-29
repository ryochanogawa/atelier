/**
 * Medium ポートインターフェース定義
 * ドメイン層にポート定義が存在するまでのローカル型定義。
 */

export interface MediumAvailability {
  available: boolean;
  version?: string;
  reason?: string;
}

export interface MediumRequest {
  prompt: string;
  systemPrompt?: string;
  workingDirectory: string;
  allowEdit: boolean;
  timeoutMs: number;
  extraArgs?: string[];
  /** 読み取り専用ツール (Read/Glob/Grep) を許可するか */
  allowReadTools?: boolean;
}

export interface MediumResponse {
  content: string;
  structured?: Record<string, unknown>;
  durationMs: number;
  tokenUsage?: { input: number; output: number };
  exitCode: number;
  rawStdout: string;
  rawStderr: string;
}

export interface MediumPort {
  readonly name: string;
  checkAvailability(): Promise<MediumAvailability>;
  execute(request: MediumRequest): Promise<MediumResponse>;
  abort(): Promise<void>;
}
