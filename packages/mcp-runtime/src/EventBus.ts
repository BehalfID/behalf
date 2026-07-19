import type { RuntimeEvent, RuntimeEventHandler, RuntimeEventType } from "./types.js";

/**
 * Lightweight in-process event bus for dashboards and integrations.
 * Handlers run sequentially; failures in one handler do not stop others.
 */
export class EventBus {
  private readonly handlers = new Map<RuntimeEventType | "*", Set<RuntimeEventHandler>>();

  on(type: RuntimeEventType | "*", handler: RuntimeEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  async emit<T>(type: RuntimeEventType, payload: T, requestId?: string): Promise<void> {
    const event: RuntimeEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      requestId,
      payload,
    };

    const specific = this.handlers.get(type);
    const wildcard = this.handlers.get("*");
    const all = [
      ...(specific ? [...specific] : []),
      ...(wildcard ? [...wildcard] : []),
    ];

    for (const handler of all) {
      try {
        await handler(event as RuntimeEvent);
      } catch {
        // Subscribers must not break the runtime path.
      }
    }
  }
}
