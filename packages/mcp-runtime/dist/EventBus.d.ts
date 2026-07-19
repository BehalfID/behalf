import type { RuntimeEventHandler, RuntimeEventType } from "./types.js";
/**
 * Lightweight in-process event bus for dashboards and integrations.
 * Handlers run sequentially; failures in one handler do not stop others.
 */
export declare class EventBus {
    private readonly handlers;
    on(type: RuntimeEventType | "*", handler: RuntimeEventHandler): () => void;
    emit<T>(type: RuntimeEventType, payload: T, requestId?: string): Promise<void>;
}
