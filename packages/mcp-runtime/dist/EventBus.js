/**
 * Lightweight in-process event bus for dashboards and integrations.
 * Handlers run sequentially; failures in one handler do not stop others.
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
        const specific = this.handlers.get(type);
        const wildcard = this.handlers.get("*");
        const all = [
            ...(specific ? [...specific] : []),
            ...(wildcard ? [...wildcard] : []),
        ];
        for (const handler of all) {
            try {
                await handler(event);
            }
            catch {
                // Subscribers must not break the runtime path.
            }
        }
    }
}
