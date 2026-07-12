import {
  workspaceApiHref,
  workspaceDashboardBasePath,
  workspaceDashboardHref
} from "@/lib/workspaceSlug";

/**
 * Module-level active workspace slug for the current browser tab.
 * Set by WorkspaceProvider so existing dashboard fetch helpers can resolve
 * /api/dashboard/* → /<slug>/api/dashboard/* without per-call threading.
 * Each tab has its own JS realm, so multi-tab isolation is preserved.
 */
let activeWorkspaceSlug: string | null = null;

export function setActiveWorkspaceSlug(slug: string | null) {
  activeWorkspaceSlug = slug;
}

export function getActiveWorkspaceSlug(): string | null {
  return activeWorkspaceSlug;
}

export function resolveDashboardFetchPath(path: string, slug = activeWorkspaceSlug): string {
  if (!slug) return path;
  if (path.startsWith("/api/dashboard") || path.startsWith("/api/billing")) {
    return workspaceApiHref(slug, path);
  }
  if (path.startsWith("/dashboard")) {
    return workspaceDashboardHref(slug, path.slice("/dashboard".length) || "");
  }
  return path;
}

export function getWorkspaceBasePath(slug: string): string {
  return workspaceDashboardBasePath(slug);
}

export function getWorkspaceHref(slug: string, subpath = ""): string {
  return workspaceDashboardHref(slug, subpath);
}

export function getWorkspaceApiPath(slug: string, path: string): string {
  return workspaceApiHref(slug, path);
}

export async function workspaceApi(
  slug: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(workspaceApiHref(slug, path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
}

export async function workspaceApiJson<T>(
  slug: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await workspaceApi(slug, path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; upgradeHint?: string }
      | null;
    const hint = body?.upgradeHint ? ` ${body.upgradeHint}` : "";
    throw new Error(`${body?.error ?? `Request failed with ${response.status}`}${hint}`);
  }
  return response.json() as Promise<T>;
}

/** Dashboard fetch that scopes to the active workspace slug when present. */
export async function dashboardFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveDashboardFetchPath(path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
}
