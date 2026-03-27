/**
 * Domain Event Base
 * 全ドメインイベントの基底インターフェース。
 */

export interface DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: Date;
  readonly payload: T;
}

export function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
