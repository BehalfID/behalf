/**
 * Transport-agnostic lifecycle bus for dashboards, telemetry, and future webhooks.
 * Handler failures never abort the enforcement path.
 */
export class EventBus {
    handlers = new Map();
    on(type, handler) {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler);
        return () => set.delete(handler);
    }
    async emit(type, payload, requestId) {
        const event = {
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
                await handler(event);
            }
            catch {
                // Subscribers must not break the PEP.
            }
        }
    }
}
