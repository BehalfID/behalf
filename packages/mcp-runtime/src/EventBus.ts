import type { RuntimeEvent, RuntimeEventHandler, RuntimeEventType } from "./types.js";

/**
 * Transport-agnostic lifecycle bus for dashboards, telemetry, and future webhooks.
 * Handler failures never abort the enforcement path.
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

  async emit<T>(
    type: RuntimeEventType,
    payload: T,
    requestId?: string
  ): Promise<void> {
    const event: RuntimeEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      requestId,
      payload,
    };

    const handlers = [
      ...(this.handlers.get(type) ?? []),
      ...(this.handlers.get("*") ?? []),
    ];

    for (const handler of handlers) {
      try {
        await handler(event as RuntimeEvent);
      } catch {
        // Subscribers must not break the PEP.
      }
    }
  }
}
