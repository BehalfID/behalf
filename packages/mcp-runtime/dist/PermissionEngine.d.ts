import type { Permission, PermissionEffect } from "./types.js";
export interface PermissionStore {
    list(filter?: {
        subjectId?: string;
        workspaceId?: string;
    }): Promise<Permission[]> | Permission[];
    get(id: string): Promise<Permission | undefined> | Permission | undefined;
    upsert(permission: Permission): Promise<void> | void;
    remove(id: string): Promise<boolean> | boolean;
}
/** In-memory permission store — swap for DB-backed implementations later. */
export declare class InMemoryPermissionStore implements PermissionStore {
    private readonly byId;
    list(filter?: {
        subjectId?: string;
        workspaceId?: string;
    }): Permission[];
    get(id: string): Permission | undefined;
    upsert(permission: Permission): void;
    remove(id: string): boolean;
}
export type PermissionEvalResult = {
    effect: PermissionEffect | "none";
    matched: Permission[];
    reason: string;
};
/**
 * Permission Engine — first-class allow/deny/scoped/wildcard evaluation.
 *
 * Deny grants take precedence over allow grants when both match.
 */
export declare class PermissionEngine {
    private readonly store;
    constructor(store: PermissionStore);
    grant(permission: Permission): Promise<void>;
    revoke(id: string): Promise<boolean>;
    list(filter?: {
        subjectId?: string;
        workspaceId?: string;
    }): Promise<Permission[]>;
    evaluate(opts: {
        action: string;
        resource?: string;
        server?: string;
        tool?: string;
        subjectId?: string;
        workspaceId?: string;
        now?: Date;
    }): Promise<PermissionEvalResult>;
}
