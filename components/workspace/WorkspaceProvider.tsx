"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode
} from "react";
import { resolveDashboardFetchPath, workspaceApiJson as scopedApiJson } from "@/lib/workspaceClient";
import {
  workspaceApiHref,
  workspaceDashboardBasePath,
  workspaceDashboardHref
} from "@/lib/workspaceSlug";

export type WorkspaceContextValue = {
  workspaceSlug: string;
  workspaceBasePath: string;
  workspaceHref: (subpath?: string) => string;
  workspaceApiPath: (path: string) => string;
  workspaceApi: (path: string, init?: RequestInit) => Promise<Response>;
  workspaceApiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspaceSlug,
  children
}: {
  workspaceSlug: string;
  children: ReactNode;
}) {
  const workspaceApiPath = useCallback(
    (path: string) => workspaceApiHref(workspaceSlug, path),
    [workspaceSlug]
  );

  const workspaceHref = useCallback(
    (subpath = "") => workspaceDashboardHref(workspaceSlug, subpath),
    [workspaceSlug]
  );

  const workspaceApi = useCallback(
    async (path: string, init?: RequestInit) => {
      const resolved = workspaceApiHref(workspaceSlug, path);
      return fetch(resolved, {
        ...init,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers
        }
      });
    },
    [workspaceSlug]
  );

  const workspaceApiJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      return scopedApiJson<T>(workspaceSlug, path, init);
    },
    [workspaceSlug]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceSlug,
      workspaceBasePath: workspaceDashboardBasePath(workspaceSlug),
      workspaceHref,
      workspaceApiPath,
      workspaceApi,
      workspaceApiJson
    }),
    [workspaceSlug, workspaceHref, workspaceApiPath, workspaceApi, workspaceApiJson]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}

export function useOptionalWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}

export type DashboardPaths = {
  workspaceSlug: string | null;
  /** Resolve /dashboard/... or /api/dashboard/... against the active workspace when present. */
  href: (path: string) => string;
  apiPath: (path: string) => string;
};

/**
 * Path helpers bound to WorkspaceProvider when present.
 * Without a provider, returns legacy /dashboard and /api/dashboard paths unchanged.
 * Slug is read synchronously from context — no useEffect / module globals.
 */
export function useDashboardPaths(): DashboardPaths {
  const ctx = useOptionalWorkspace();
  const workspaceSlug = ctx?.workspaceSlug ?? null;

  return useMemo(
    () => ({
      workspaceSlug,
      href: (path: string) => resolveDashboardFetchPath(path, workspaceSlug),
      apiPath: (path: string) => resolveDashboardFetchPath(path, workspaceSlug)
    }),
    [workspaceSlug]
  );
}

export type DashboardApi = DashboardPaths & {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  apiJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

/**
 * Fetch helpers bound to the current workspace context.
 * Prefer this for all dashboard mutations and reads from React trees.
 */
export function useDashboardApi(): DashboardApi {
  const paths = useDashboardPaths();

  const fetchBound = useCallback(
    async (path: string, init?: RequestInit) => {
      return fetch(paths.apiPath(path), {
        ...init,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers
        }
      });
    },
    [paths]
  );

  const apiJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetchBound(path, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string; upgradeHint?: string }
          | null;
        const hint = body?.upgradeHint ? ` ${body.upgradeHint}` : "";
        throw new Error(`${body?.error ?? `Request failed with ${response.status}`}${hint}`);
      }
      return response.json() as Promise<T>;
    },
    [fetchBound]
  );

  return useMemo(
    () => ({
      ...paths,
      fetch: fetchBound,
      apiJson
    }),
    [paths, fetchBound, apiJson]
  );
}
