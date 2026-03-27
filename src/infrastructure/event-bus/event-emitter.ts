/**
 * TypedEventEmitter
 * Node.js EventEmitter のラッパーで型安全なイベント発行を提供する。
 */

import { EventEmitter } from "node:events";

/**
 * イベントマップ型: イベント名 -> ペイロード型 のマッピング。
 */
export type EventMap = Record<string, unknown>;

/**
 * 型安全な EventEmitter。
 * イベント名とペイロードの型を静的に検証する。
 */
export class TypedEventEmitter<T extends EventMap> {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
  ): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof T & string>(event: K, payload: T[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  removeAllListeners<K extends keyof T & string>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  listenerCount<K extends keyof T & string>(event: K): number {
    return this.emitter.listenerCount(event);
  }
}

/**
 * Atelier のドメインイベント定義。
 */
export interface AtelierEvents extends EventMap {
  "commission:start": { runId: string; commissionName: string };
  "commission:complete": { runId: string; commissionName: string; duration: number };
  "commission:fail": { runId: string; commissionName: string; error: string };
  "stroke:start": { runId: string; strokeName: string };
  "stroke:complete": { runId: string; strokeName: string; duration: number };
  "stroke:fail": { runId: string; strokeName: string; error: string };
  "medium:request": { runId: string; mediumName: string; strokeName: string };
  "medium:response": { runId: string; mediumName: string; strokeName: string; duration: number };
}

/**
 * シングルトン的に使えるイベントバスを生成する。
 */
export function createEventBus(): TypedEventEmitter<AtelierEvents> {
  return new TypedEventEmitter<AtelierEvents>();
}
