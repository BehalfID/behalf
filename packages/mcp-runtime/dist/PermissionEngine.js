import { permissionApplies } from "./permissions/match.js";
/** In-memory permission store — swap for DB-backed implementations later. */
export class InMemoryPermissionStore {
    byId = new Map();
    list(filter) {
        return [...this.byId.values()].filter((p) => {
            if (filter?.subjectId && p.subjectId && p.subjectId !== filter.subjectId) {
                return false;
            }
            if (filter?.workspaceId &&
                p.workspaceId &&
                p.workspaceId !== filter.workspaceId) {
                return false;
            }
            return true;
        });
    }
    get(id) {
        return this.byId.get(id);
    }
    upsert(permission) {
        this.byId.set(permission.id, permission);
    }
    remove(id) {
        return this.byId.delete(id);
    }
}
/**
 * Permission Engine — first-class allow/deny/scoped/wildcard evaluation.
 *
 * Deny grants take precedence over allow grants when both match.
 */
export class PermissionEngine {
    store;
    constructor(store) {
        this.store = store;
    }
    async grant(permission) {
        await this.store.upsert(permission);
    }
    async revoke(id) {
        return this.store.remove(id);
    }
    async list(filter) {
        return this.store.list(filter);
    }
    async evaluate(opts) {
        const all = await this.store.list({
            subjectId: opts.subjectId,
            workspaceId: opts.workspaceId,
        });
        const matched = all.filter((p) => permissionApplies(p, opts));
        if (matched.length === 0) {
            return {
                effect: "none",
                matched: [],
                reason: "No matching permission",
            };
        }
        const denies = matched.filter((p) => p.effect === "deny");
        if (denies.length > 0) {
            return {
                effect: "deny",
                matched: denies,
                reason: `Denied by permission ${denies[0].id} (${denies[0].action})`,
            };
        }
        const allows = matched.filter((p) => p.effect === "allow");
        return {
            effect: "allow",
            matched: allows,
            reason: `Allowed by permission ${allows[0].id} (${allows[0].action})`,
        };
    }
}
