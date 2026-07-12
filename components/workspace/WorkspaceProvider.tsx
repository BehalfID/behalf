"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { setActiveWorkspaceSlug } from "@/lib/workspaceClient";
import {
  workspaceApiHref,
  workspaceDashboardBasePath,
  workspaceDashboardHref
} from "@/lib/workspaceSlug";

export type WorkspaceContextValue = {
  workspaceSlug: string;
  workspaceBasePath: string;
  workspaceHref: (subpath?: string) => string;
  workspaceApi: (path: string, init?: RequestInit) => Promise<Response>;
  workspaceApiPath: (path: string) => string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspaceSlug,
  children
}: {
  workspaceSlug: string;
  children: ReactNode;
}) {
  useEffect(() => {
    setActiveWorkspaceSlug(workspaceSlug);
    return () => setActiveWorkspaceSlug(null);
  }, [workspaceSlug]);

  const workspaceApiPath = useCallback(
    (path: string) => workspaceApiHref(workspaceSlug, path),
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

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceSlug,
      workspaceBasePath: workspaceDashboardBasePath(workspaceSlug),
      workspaceHref: (subpath = "") => workspaceDashboardHref(workspaceSlug, subpath),
      workspaceApi,
      workspaceApiPath
    }),
    [workspaceSlug, workspaceApi, workspaceApiPath]
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
