import { permissionApplies } from "./permissions/match.js";
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
export class InMemoryPermissionStore implements PermissionStore {
  private readonly byId = new Map<string, Permission>();

  list(filter?: { subjectId?: string; workspaceId?: string }): Permission[] {
    return [...this.byId.values()].filter((p) => {
      if (filter?.subjectId && p.subjectId && p.subjectId !== filter.subjectId) {
        return false;
      }
      if (
        filter?.workspaceId &&
        p.workspaceId &&
        p.workspaceId !== filter.workspaceId
      ) {
        return false;
      }
      return true;
    });
  }

  get(id: string): Permission | undefined {
    return this.byId.get(id);
  }

  upsert(permission: Permission): void {
    this.byId.set(permission.id, permission);
  }

  remove(id: string): boolean {
    return this.byId.delete(id);
  }
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
export class PermissionEngine {
  constructor(private readonly store: PermissionStore) {}

  async grant(permission: Permission): Promise<void> {
    await this.store.upsert(permission);
  }

  async revoke(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  async list(filter?: {
    subjectId?: string;
    workspaceId?: string;
  }): Promise<Permission[]> {
    return this.store.list(filter);
  }

  async evaluate(opts: {
    action: string;
    resource?: string;
    server?: string;
    tool?: string;
    subjectId?: string;
    workspaceId?: string;
    now?: Date;
  }): Promise<PermissionEvalResult> {
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
        reason: `Denied by permission ${denies[0]!.id} (${denies[0]!.action})`,
      };
    }

    const allows = matched.filter((p) => p.effect === "allow");
    return {
      effect: "allow",
      matched: allows,
      reason: `Allowed by permission ${allows[0]!.id} (${allows[0]!.action})`,
    };
  }
}
