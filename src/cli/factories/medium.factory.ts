/**
 * Medium Factory
 * MediumExecutor の生成を一元化するファクトリ。
 * CLI コマンドの重複した createMediumRegistry() を置換する。
 */

import { createDefaultRegistry } from "../../adapters/medium/medium-registry.js";
import { SubprocessMediumExecutor } from "../../application/services/subprocess-medium-executor.js";
import type { MediumExecutor } from "../../application/ports/medium-executor.port.js";

export function createMediumExecutor(): MediumExecutor {
  const registry = createDefaultRegistry();
  return new SubprocessMediumExecutor(registry);
}
