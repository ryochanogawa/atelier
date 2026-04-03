/**
 * MediumRegistry
 * Mediumアダプターの登録・取得・一覧管理。
 */

import type { MediumPort, MediumAvailability } from "../../domain/ports/medium.port.js";
import { ClaudeCodeAdapter } from "./claude-code.adapter.js";
import { CodexAdapter } from "./codex.adapter.js";
import { GeminiAdapter } from "./gemini.adapter.js";

export interface MediumAvailabilityReport {
  name: string;
  availability: MediumAvailability;
}

export class MediumRegistry {
  private readonly adapters = new Map<string, MediumPort>();

  register(adapter: MediumPort): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): MediumPort | undefined {
    return this.adapters.get(name);
  }

  getOrThrow(name: string): MediumPort {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(
        `Medium "${name}" is not registered. Available: ${this.listNames().join(", ")}`,
      );
    }
    return adapter;
  }

  listNames(): string[] {
    return [...this.adapters.keys()];
  }

  list(): MediumPort[] {
    return [...this.adapters.values()];
  }

  async checkAll(): Promise<MediumAvailabilityReport[]> {
    const results = await Promise.all(
      this.list().map(async (adapter) => ({
        name: adapter.name,
        availability: await adapter.checkAvailability(),
      })),
    );
    return results;
  }
}

/**
 * デフォルトのMediumRegistry を生成する。
 * claude-code, codex, gemini を登録済みで返す。
 */
export function createDefaultRegistry(): MediumRegistry {
  const registry = new MediumRegistry();
  registry.register(new ClaudeCodeAdapter());
  registry.register(new CodexAdapter());
  registry.register(new GeminiAdapter());
  return registry;
}
