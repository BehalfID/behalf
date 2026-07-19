import type { Permission } from "../types.js";
/**
 * Match a permission action pattern against a concrete action.
 *
 * Supports:
 * - exact: `filesystem.read`
 * - wildcard segment: `filesystem.*`
 * - full wildcard: `*`
 */
export declare function matchAction(pattern: string, action: string): boolean;
/** Match a resource scope. Trailing `*` is supported. */
export declare function matchResource(pattern: string | undefined, resource: string | undefined): boolean;
export declare function isPermissionExpired(permission: Permission, now?: Date): boolean;
/**
 * Evaluate whether a permission grant applies to a concrete request.
 */
export declare function permissionApplies(permission: Permission, opts: {
    action: string;
    resource?: string;
    server?: string;
    tool?: string;
    subjectId?: string;
    workspaceId?: string;
    now?: Date;
}): boolean;
/**
 * Derive a logical permission string from server/tool names when the caller
 * does not supply one. Heuristic only — hosts may override via invocation.permission.
 */
export declare function derivePermission(server: string, tool: string): string;
