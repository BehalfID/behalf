"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import { SmartAutocomplete } from "@/components/ui/SmartAutocomplete";
import { useDashboardApi, useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import type { SmartSuggestion } from "@/lib/smartSearch";
import { parseSmartLogQuery } from "@/lib/smartSearch";

type OmniSearchContextValue = {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
};

const OmniSearchContext = createContext<OmniSearchContextValue | null>(null);

function useOmniSearch() {
  const ctx = useContext(OmniSearchContext);
  if (!ctx) {
    throw new Error("DashboardOmniSearchTrigger must be used within DashboardOmniSearchProvider");
  }
  return ctx;
}

export function DashboardOmniSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { href } = useDashboardPaths();
  const { apiJson } = useDashboardApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteSuggestions, setRemoteSuggestions] = useState<SmartSuggestion[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRemoteSuggestions([]);
  }, []);

  const openSearch = useCallback(() => setOpen(true), []);
  const toggleSearch = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeSearch();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const path = `/api/dashboard/search/suggest?${params.toString()}`;
        const body = await apiJson<{ suggestions?: SmartSuggestion[]; facets?: SmartSuggestion[] }>(path);
        if (!cancelled) setRemoteSuggestions(body.facets ?? []);
      } catch {
        if (!cancelled) setRemoteSuggestions([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [apiJson, open, query]);

  const applySuggestion = useCallback(
    (suggestion: SmartSuggestion) => {
      if (suggestion.href) {
        const target = suggestion.href.startsWith("/dashboard")
          ? href(suggestion.href)
          : suggestion.href;
        router.push(target);
        closeSearch();
        return;
      }
      if (suggestion.kind === "log_query" || suggestion.kind === "field" || suggestion.logFilters) {
        const parsed = parseSmartLogQuery(suggestion.query);
        const params = new URLSearchParams();
        const decision = suggestion.logFilters?.decision ?? parsed.decision;
        const risk = suggestion.logFilters?.risk ?? parsed.risk;
        const environment = suggestion.logFilters?.environment ?? parsed.environment;
        const action = suggestion.logFilters?.action ?? parsed.action;
        const agentId = suggestion.logFilters?.agentId ?? parsed.agentId;
        const range = suggestion.logFilters?.range ?? parsed.range;
        const search =
          suggestion.logFilters?.search !== undefined
            ? suggestion.logFilters.search
            : parsed.freeText || suggestion.query;
        if (decision) params.set("decision", decision);
        if (risk) params.set("risk", risk);
        if (environment) params.set("environment", environment);
        if (action) params.set("action", action);
        if (agentId) params.set("agentId", agentId);
        if (range) params.set("range", range);
        if (search) params.set("search", search);
        const qs = params.toString();
        router.push(href(`/dashboard/logs${qs ? `?${qs}` : ""}`));
        closeSearch();
        return;
      }
      setQuery(suggestion.query);
    },
    [closeSearch, href, router]
  );

  const contextValue = useMemo(
    () => ({ open, openSearch, closeSearch, toggleSearch }),
    [closeSearch, open, openSearch, toggleSearch]
  );

  return (
    <OmniSearchContext.Provider value={contextValue}>
      {children}
      {open ? (
        <div className="dashboard-omni">
          <button type="button" className="dashboard-omni__backdrop" aria-label="Close search" onClick={closeSearch} />
          <div
            ref={dialogRef}
            className="dashboard-omni__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
          >
            <SmartAutocomplete
              autoFocus
              scope="all"
              value={query}
              onChange={setQuery}
              placeholder="Find a denied action that's high risk…"
              label="Search logs, docs, and workspace knowledge"
              emptyHint="No matches — try “denied”, “webhooks”, or “agents”"
              extraSuggestions={remoteSuggestions}
              onSelectSuggestion={applySuggestion}
              onSubmit={(value) => {
                const trimmed = value.trim();
                if (!trimmed) return;
                const params = new URLSearchParams({ search: trimmed });
                router.push(href(`/dashboard/logs?${params.toString()}`));
                closeSearch();
              }}
            />
            <p className="dashboard-omni__hint">
              Suggestions cover audit-log queries, documentation, and common workspace pages. Press Esc to close.
            </p>
          </div>
        </div>
      ) : null}
    </OmniSearchContext.Provider>
  );
}

export function DashboardOmniSearchTrigger({ variant = "bar" }: { variant?: "bar" | "icon" }) {
  const { openSearch } = useOmniSearch();

  const hint = useMemo(() => {
    const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
    return mac ? "⌘K" : "Ctrl+K";
  }, []);

  if (variant === "icon") {
    return (
      <button
        type="button"
        className="dashboard-omni-trigger dashboard-omni-trigger--icon"
        onClick={openSearch}
        aria-label="Search logs and docs"
        title={`Search (${hint})`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12.2 12.2 15.5 15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <button type="button" className="dashboard-omni-trigger" onClick={openSearch}>
      <span>Search logs, docs…</span>
      <kbd>{hint}</kbd>
    </button>
  );
}

/** @deprecated Prefer Provider + Trigger; kept for any stray imports. */
export function DashboardOmniSearch() {
  return <DashboardOmniSearchTrigger variant="bar" />;
}
