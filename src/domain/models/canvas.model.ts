/**
 * Canvas Model
 * Stroke間の共有状態を保持するKVS（Key-Value Store）エンティティ。
 */

export class Canvas {
  private readonly store: Map<string, unknown>;

  constructor(initial?: ReadonlyMap<string, unknown> | Record<string, unknown>) {
    if (initial instanceof Map) {
      this.store = new Map(initial);
    } else if (initial !== undefined) {
      this.store = new Map(Object.entries(initial));
    } else {
      this.store = new Map();
    }
  }

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  entries(): IterableIterator<[string, unknown]> {
    return this.store.entries();
  }

  get size(): number {
    return this.store.size;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }

  snapshot(): ReadonlyMap<string, unknown> {
    return new Map(this.store);
  }

  restore(snapshot: ReadonlyMap<string, unknown>): void {
    this.store.clear();
    for (const [key, value] of snapshot) {
      this.store.set(key, value);
    }
  }
}
