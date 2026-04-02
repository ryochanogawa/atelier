/**
 * Shared Constants
 * プロジェクト全体で使用する定数。
 */

/** Atelier 設定ディレクトリ名 */
export const ATELIER_DIR = ".atelier";

/** デフォルトのタイムアウト (ミリ秒): 5分 */
export const DEFAULT_TIMEOUT_MS = 300_000;

/** 1つの Stroke のデフォルト最大リトライ回数 */
export const DEFAULT_MAX_RETRIES = 3;

/** Commission 内で実行できる Stroke の最大数（API制限対策のため控えめに設定） */
export const MAX_STROKES = 5;

/** ログファイルの最大保持数 */
export const MAX_LOG_FILES = 100;

/** RunId のプレフィックス */
export const RUN_ID_PREFIX = "run_";

/** 設定ファイル名 */
export const STUDIO_CONFIG_FILE = "studio.yaml";

/** Commission ディレクトリ名 */
export const COMMISSIONS_DIR = "commissions";

/** Palette ディレクトリ名 */
export const PALETTES_DIR = "palettes";

/** Policy ディレクトリ名 */
export const POLICIES_DIR = "policies";

/** Knowledge ディレクトリ名 */
export const KNOWLEDGE_DIR = "knowledge";

/** Contract ディレクトリ名 */
export const CONTRACTS_DIR = "contracts";

/** Instruction ディレクトリ名 */
export const INSTRUCTIONS_DIR = "instructions";

/** ログディレクトリ名 */
export const LOGS_DIR = "logs";

/** studio.yaml が存在しない場合のデフォルト media 定義 */
export const DEFAULT_MEDIA: Record<string, { command: string; args: string[] }> = {
  "claude-code": { command: "claude", args: ["--print", "--dangerously-skip-permissions"] },
  codex: { command: "codex", args: ["--quiet"] },
  gemini: { command: "gemini", args: ["--prompt"] },
};

/** 要件定義ディレクトリ名 */
export const REQUIREMENTS_DIR = "requirements";

/** セッションディレクトリ名 */
export const SESSIONS_DIR = "sessions";

/** CLI バージョン */
export const CLI_VERSION = "0.1.0";

/** CLI 名 */
export const CLI_NAME = "atelier";
