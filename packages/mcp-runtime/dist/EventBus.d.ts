import type { RuntimeEventHandler, RuntimeEventType } from "./types.js";
/**
 * Transport-agnostic lifecycle bus for dashboards, telemetry, and future webhooks.
 * Handler failures never abort the enforcement path.
 */
export declare class EventBus {
    private readonly handlers;
    on(type: RuntimeEventType | "*", handler: RuntimeEventHandler): () => void;
    emit<T>(type: RuntimeEventType, payload: T, requestId?: string): Promise<void>;
}
