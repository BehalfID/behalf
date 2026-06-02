"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConsoleShellLayout } from "@/components/layout/ConsoleShell";
import { Button, ButtonLink, CodeBlock, EmptyState, Logo, PageHeader, StatCard } from "@/components/ui";

type Agent = {
  agentId: string;
  name: string;
  status: "active" | "disabled";
  agentType: "native" | "connected";
  provider: string;
  connectionStatus: "manual" | "connected" | "disconnected";
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  description?: string | null;
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Permission = {
  permissionId: string;
  action: string;
  description?: string;
  resource?: string | null;
  scope?: string | null;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string | null;
  template?: string | null;
  constraints?: {
    maxAmount?: number;
    allowedVendors?: string[];
    expiresAt?: string;
  };
  status: "active" | "revoked";
  lastUsedAt?: string | null;
  createdAt?: string;
};

type VerificationLog = {
  requestId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  agentId: string;
  agentName?: string | null;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
};
type LogSummary = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

type Summary = {
  totalAgents: number;
  activePermissions: number;
  logsToday: number;
  lastVerification: VerificationLog | null;
  totalUsers: number;
  newUsersToday: number;
  pendingApprovals: number;
  highRiskToday: number;
};

type TodoPriority = "high" | "medium" | "low";
type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  priority: TodoPriority;
  createdAt: string;
};

type AgentDetail = {
  agent: Agent;
  permissions: Permission[];
  logs: VerificationLog[];
};

type AgentsResponse = { agents: Agent[] };
type LogsResponse = { logs: VerificationLog[]; summary: LogSummary };
type SiteGuardSite = {
  siteId: string;
  developerUserId?: string;
  name: string;
  domain: string;
  status: "active" | "disabled";
  createdAt?: string;
};
type SiteGuardLog = {
  requestId: string;
  siteId: string;
  domain: string;
  path: string;
  userAgent: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
};
type Settings = {
  appUrl: string;
  environment: string;
  mongoConfigured: boolean;
  mongoStatus: string;
  publicAgentCreation: string;
  setupTokenConfigured: boolean;
  rateLimitMode: string;
  metadataLogging: string;
  securityWarnings: string[];
  limitations: string[];
};

type Webhook = {
  webhookId: string;
  url: string;
  secretPreview: string;
  events: string[];
  status: "active" | "disabled";
  lastTriggeredAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type WebhookDelivery = {
  deliveryId: string;
  eventId: string;
  eventType: string;
  status: "success" | "failed";
  httpStatus?: number;
  error?: string;
  attempt: number;
  nextRetryAt?: string | null;
  maxAttempts?: number;
  createdAt?: string;
};

type WebhookEventRecord = {
  eventId: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  nextAttemptAt?: string | null;
  deadLetter: boolean;
  lastError?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type WebhooksResponse = {
  webhooks: Webhook[];
  eventTypes: string[];
};

type WebhookEventsResponse = {
  events: WebhookEventRecord[];
};

type WebhookEventDetail = {
  event: WebhookEventRecord & {
    payload: Record<string, unknown>;
  };
  deliveries: WebhookDelivery[];
};

type WebhookDetail = {
  webhook: Webhook;
  deliveries: WebhookDelivery[];
};

type ApiError = Error & { status?: number };

const consoleProviderOptions = [
  ["custom", "Custom"],
  ["ollie", "Ollie"],
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["zapier", "Zapier"],
  ["make", "Make"],
  ["langchain", "LangChain"],
  ["openai", "OpenAI"],
  ["other", "Other"]
];

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : undefined),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const error = new Error(body?.error ?? `Request failed with ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusClass(status: string) {
  return `console-status console-status--${status}`;
}

function tomorrowIsoLocal() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function useApiResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (requestError) {
      setError(requestError as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<T>(path);
        if (!cancelled) {
          setData(result);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError as ApiError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, error, reload };
}

export function LoginPage() {
  const router = useRouter();
  return (
    <main id="main-content" className="console-login-page" tabIndex={-1}>
      <LoginPanel onSuccess={() => router.push("/console")} />
    </main>
  );
}

export function ConsolePage({ view }: { view: "dashboard" | "agents" | "site-guard" | "webhooks" | "webhook-events" | "logs" | "settings" | "status" | "enterprise-inquiries" }) {
  return (
    <ConsoleFrame>
      {view === "dashboard" ? <DashboardView /> : null}
      {view === "agents" ? <AgentsView /> : null}
      {view === "site-guard" ? <SiteGuardView /> : null}
      {view === "webhooks" ? <WebhooksView /> : null}
      {view === "webhook-events" ? <WebhookEventsView /> : null}
      {view === "logs" ? <LogsView /> : null}
      {view === "settings" ? <SettingsView /> : null}
      {view === "status" ? <StatusView /> : null}
      {view === "enterprise-inquiries" ? <EnterpriseInquiriesView /> : null}
    </ConsoleFrame>
  );
}

export function WebhookDetailPage({ webhookId }: { webhookId: string }) {
  return (
    <ConsoleFrame>
      <WebhookDetailView webhookId={webhookId} />
    </ConsoleFrame>
  );
}

export function WebhookEventDetailPage({ eventId }: { eventId: string }) {
  return (
    <ConsoleFrame>
      <WebhookEventDetailView eventId={eventId} />
    </ConsoleFrame>
  );
}

export function AgentDetailPage({ agentId }: { agentId: string }) {
  return (
    <ConsoleFrame>
      <AgentDetailView agentId={agentId} />
    </ConsoleFrame>
  );
}

function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const logout = async () => {
    await apiFetch("/api/console/logout", { method: "POST" }).catch(() => undefined);
    router.push("/console/login");
  };

  return (
    <ConsoleShellLayout onLogout={logout}>{children}</ConsoleShellLayout>
  );
}

function LoginPanel({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/console/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setPassword("");
      onSuccess();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="console-login auth-shell auth-shell--console">
      <div className="auth-context">
        <Logo />
        <div>
          <p className="section-kicker">Internal console</p>
          <h2>Prototype administration for BehalfID.</h2>
          <p>Use this area for internal setup, health checks, webhook operations, and prototype-wide resource inspection.</p>
        </div>
        <ul>
          <li>Admin-only access</li>
          <li>Environment health</li>
          <li>Webhook event replay</li>
          <li>Operational audit views</li>
        </ul>
      </div>
      <form className="console-login__panel" onSubmit={submit}>
        <p className="console-kicker">Console access</p>
        <h1>BehalfID</h1>
        <p className="console-muted">Internal access for prototype administration.</p>
        <label>
          <span>Admin password</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="console-error" role="alert">{error}</p> : null}
        <Button variant="primary" disabled={submitting} type="submit">
          {submitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

function ResourceState<T>({
  resource,
  children
}: {
  resource: ReturnType<typeof useApiResource<T>>;
  children: (data: T) => React.ReactNode;
}) {
  if (resource.loading) return <EmptyState className="console-empty">Loading</EmptyState>;
  if (resource.error?.status === 401) {
    return <EmptyState className="console-empty">Session expired. Sign in again.</EmptyState>;
  }
  if (resource.error) return <EmptyState className="console-empty">{resource.error.message}</EmptyState>;
  if (!resource.data) return <EmptyState className="console-empty">No data available.</EmptyState>;
  return children(resource.data);
}

function DashboardView() {
  const summary = useApiResource<Summary>("/api/console/summary");

  return (
    <ResourceState resource={summary}>
      {(data) => (
        <>
          <Header
            title="Dashboard"
            action={
              <ButtonLink variant="primary" href="/console/agents">
                Manage agents
              </ButtonLink>
            }
          />

          {/* Health strip */}
          <HealthStrip data={data} />

          {/* Security alerts */}
          {(data.pendingApprovals > 0 || data.highRiskToday > 0) && (
            <div className="console-alert" role="alert">
              <span className="console-alert__icon">⚠</span>
              <div>
                <strong>Attention required</strong>
                <ul>
                  {data.pendingApprovals > 0 && (
                    <li>{data.pendingApprovals} approval{data.pendingApprovals !== 1 ? "s" : ""} pending review</li>
                  )}
                  {data.highRiskToday > 0 && (
                    <li>{data.highRiskToday} high-risk verification{data.highRiskToday !== 1 ? "s" : ""} flagged today</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <section className="console-metrics">
            <StatCard label="Total agents" value={data.totalAgents} />
            <StatCard label="Active permissions" value={data.activePermissions} />
            <StatCard label="Logs today" value={data.logsToday} />
            <StatCard label="Total users" value={data.totalUsers} />
            <StatCard label="New users today" value={data.newUsersToday} />
            <Metric
              label="Last result"
              value={data.lastVerification ? (data.lastVerification.allowed ? "Allowed" : "Denied") : "None"}
            />
          </section>

          {/* Quick actions */}
          <section>
            <SectionTitle title="Quick actions" />
            <QuickActions />
          </section>

          {/* Main bottom zone: last verification + todo */}
          <div className="console-dashboard-bottom">
            <section>
              <SectionTitle title="Last verification" />
              {data.lastVerification ? (
                <LogList logs={[data.lastVerification]} />
              ) : (
                <EmptyState className="console-empty">No verification logs yet.</EmptyState>
              )}
            </section>
            <section>
              <SectionTitle title="Admin to-do" />
              <TodoList />
            </section>
          </div>
        </>
      )}
    </ResourceState>
  );
}

function HealthStrip({ data }: { data: Summary }) {
  const dbOk = true; // If we're rendering, DB responded
  const hasHighRisk = data.highRiskToday > 0;
  const hasPending = data.pendingApprovals > 0;

  return (
    <div className="console-health" style={{ marginBottom: 20 }}>
      <div className="console-health__item">
        <span className={`console-health__dot console-health__dot--ok`} />
        <span><strong>API</strong> operational</span>
      </div>
      <div className="console-health__sep" />
      <div className="console-health__item">
        <span className={`console-health__dot ${dbOk ? "console-health__dot--ok" : "console-health__dot--err"}`} />
        <span><strong>DB</strong> {dbOk ? "connected" : "unreachable"}</span>
      </div>
      <div className="console-health__sep" />
      <div className="console-health__item">
        <span className={`console-health__dot ${hasPending ? "console-health__dot--warn" : "console-health__dot--ok"}`} />
        <span><strong>Approvals</strong> {data.pendingApprovals === 0 ? "clear" : `${data.pendingApprovals} pending`}</span>
      </div>
      <div className="console-health__sep" />
      <div className="console-health__item">
        <span className={`console-health__dot ${hasHighRisk ? "console-health__dot--warn" : "console-health__dot--ok"}`} />
        <span><strong>Risk</strong> {data.highRiskToday === 0 ? "no high-risk today" : `${data.highRiskToday} high-risk today`}</span>
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: "View logs", href: "/console/logs", icon: "📋" },
  { label: "Manage agents", href: "/console/agents", icon: "🤖" },
  { label: "Webhooks", href: "/console/webhooks", icon: "🔗" },
  { label: "Event queue", href: "/console/webhook-events", icon: "📨" },
  { label: "Site Guard", href: "/console/site-guard", icon: "🛡" },
  { label: "Enterprise", href: "/console/enterprise-inquiries", icon: "🏢" },
  { label: "Settings", href: "/console/settings", icon: "⚙️" },
];

function QuickActions() {
  return (
    <div className="console-quick-actions" style={{ marginBottom: 28 }}>
      {QUICK_ACTIONS.map((action) => (
        <a className="console-quick-action" href={action.href} key={action.href}>
          <span className="console-quick-action__icon">{action.icon}</span>
          {action.label}
        </a>
      ))}
    </div>
  );
}

const TODO_STORAGE_KEY = "behalf-console-todos";

function loadTodos(): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TODO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(items: TodoItem[]) {
  try {
    window.localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable — silent fail
  }
}

function TodoList() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<TodoPriority>("medium");

  // Load from localStorage on mount
  useEffect(() => {
    setItems(loadTodos());
  }, []);

  const persist = (next: TodoItem[]) => {
    setItems(next);
    saveTodos(next);
  };

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = newText.trim();
    if (!text) return;
    const item: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      done: false,
      priority: newPriority,
      createdAt: new Date().toISOString()
    };
    persist([item, ...items]);
    setNewText("");
  };

  const toggleDone = (id: string) => {
    persist(items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const updateText = (id: string, text: string) => {
    persist(items.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const deleteItem = (id: string) => {
    persist(items.filter((item) => item.id !== id));
  };

  const clearDone = () => {
    persist(items.filter((item) => !item.done));
  };

  const pending = items.filter((i) => !i.done).length;
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="console-todo">
      <div className="console-todo__header">
        <h2>
          To-do
          {pending > 0 && <span className="console-todo__count" style={{ marginLeft: 8 }}>{pending}</span>}
        </h2>
        {items.some((i) => i.done) && (
          <button className="ui-button" onClick={clearDone} type="button" style={{ fontSize: "0.78rem", minHeight: 28, padding: "0 10px" }}>
            Clear done
          </button>
        )}
      </div>

      <form className="console-todo__add" onSubmit={addItem}>
        <input
          aria-label="New to-do item"
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a task…"
          value={newText}
        />
        <select
          aria-label="Priority"
          onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
          value={newPriority}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="ui-button ui-button--primary" type="submit" style={{ flex: "0 0 auto", fontSize: "0.82rem" }}>
          Add
        </button>
      </form>

      <div className="console-todo__list">
        {sorted.length === 0 ? (
          <p className="console-todo__empty">No tasks yet — add one above.</p>
        ) : (
          sorted.map((item) => (
            <TodoRow
              key={item.id}
              item={item}
              onToggle={() => toggleDone(item.id)}
              onTextChange={(text) => updateText(item.id, text)}
              onDelete={() => deleteItem(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TodoRow({
  item,
  onToggle,
  onTextChange,
  onDelete
}: {
  item: TodoItem;
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onDelete: () => void;
}) {
  const dateStr = useMemo(() => {
    const d = new Date(item.createdAt);
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
  }, [item.createdAt]);

  return (
    <div className={`console-todo__item${item.done ? " console-todo__item--done" : ""}`}>
      <button
        aria-label={item.done ? "Mark incomplete" : "Mark complete"}
        className={`console-todo__check${item.done ? " console-todo__check--checked" : ""}`}
        onClick={onToggle}
        type="button"
      />
      <div className="console-todo__body">
        <textarea
          aria-label="Task text"
          className="console-todo__text"
          onChange={(e) => onTextChange(e.target.value)}
          rows={1}
          style={{ minHeight: "unset", overflowY: "hidden" }}
          value={item.text}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
        <div className="console-todo__meta">
          <span className={`console-todo__priority console-todo__priority--${item.priority}`}>
            {item.priority}
          </span>
          <span className="console-todo__date">{dateStr}</span>
        </div>
      </div>
      <button
        aria-label="Delete task"
        className="console-todo__del"
        onClick={onDelete}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function AgentsView() {
  const agents = useApiResource<AgentsResponse>("/api/console/agents");
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState<Agent["agentType"]>("native");
  const [provider, setProvider] = useState("custom");
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [createError, setCreateError] = useState("");

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    const trimmed = name.trim();
    if (agents.data?.agents.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      setCreateError(`An agent named "${trimmed}" already exists.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch<{ agent: Agent; apiKey: string }>("/api/console/agents", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, agentType, provider })
      });
      setOneTimeKey(result.apiKey);
      setName("");
      setAgentType("native");
      setProvider("custom");
      await agents.reload();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResourceState resource={agents}>
      {(data) => {
        const nameCounts = data.agents.reduce<Record<string, number>>((acc, a) => {
          const key = a.name.toLowerCase();
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        const duplicateNames = Object.entries(nameCounts)
          .filter(([, count]) => count > 1)
          .map(([n]) => n);
        const filtered = agentSearch
          ? data.agents.filter((a) =>
              a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
              a.agentId.toLowerCase().includes(agentSearch.toLowerCase()) ||
              a.provider.toLowerCase().includes(agentSearch.toLowerCase())
            )
          : data.agents;
        return (
        <>
          <Header title="Agents" />
          {duplicateNames.length > 0 && (
            <div className="console-alert" role="alert">
              <span className="console-alert__icon">⚠</span>
              <div>
                <strong>Duplicate agent names detected</strong>
                <p>Multiple agents share the same name: {duplicateNames.join(", ")}. Consider consolidating or renaming to avoid confusion.</p>
              </div>
            </div>
          )}
          <section className="console-split">
            <div>
              <SectionTitle title="Agents" />
              <div className="console-toolbar" style={{ marginBottom: 12 }}>
                <input
                  aria-label="Search agents"
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search by name, ID, or provider…"
                  value={agentSearch}
                  style={{ flex: 1 }}
                />
              </div>
              <AgentTable agents={filtered} />
            </div>
            <form className="console-panel" onSubmit={createAgent}>
              <SectionTitle title="Add agent" />
              <label>
                <span>Name</span>
                <input onChange={(event) => setName(event.target.value)} placeholder="e.g. Checkout agent, Ollie, Finance tutor" required value={name} />
              </label>
              <label>
                <span>Type</span>
                <select onChange={(event) => setAgentType(event.target.value as Agent["agentType"])} value={agentType}>
                  <option value="native">Native</option>
                  <option value="connected">Connected</option>
                </select>
              </label>
              <label>
                <span>Provider</span>
                <select onChange={(event) => setProvider(event.target.value)} value={provider}>
                  {consoleProviderOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {createError ? <p className="console-error" role="alert">{createError}</p> : null}
              <Button variant="primary" disabled={submitting} type="submit">
                {submitting ? "Adding" : "Add agent"}
              </Button>
              {oneTimeKey ? <SecretBox label="New API key" value={oneTimeKey} /> : null}
            </form>
          </section>
        </>
        );
      }}
    </ResourceState>
  );
}

function SiteGuardView() {
  const sites = useApiResource<{ sites: SiteGuardSite[] }>("/api/console/sites");
  const logs = useApiResource<{ logs: SiteGuardLog[] }>("/api/console/site-guard/logs");
  const setStatus = async (site: SiteGuardSite) => {
    await apiFetch(`/api/console/sites/${site.siteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: site.status === "active" ? "disabled" : "active" })
    });
    await sites.reload();
  };

  return (
    <>
      <Header title="Site Guard" />
      {sites.error ? <p className="form-error" role="alert">{sites.error.message}</p> : null}
      {logs.error ? <p className="form-error" role="alert">{logs.error.message}</p> : null}
      <section className="console-grid">
        <div className="console-panel">
          <SectionTitle title="Sites" />
          <div className="console-list">
            {(sites.data?.sites ?? []).length === 0 ? (
              <div className="console-empty-state">
                <strong>No protected sites yet</strong>
                <p>Site Guard lets you control which domains can make verification requests to BehalfID. Register your app&apos;s domain to restrict API access to known origins.</p>
                <p>Use the <code>POST /api/sites</code> endpoint or the BehalfID SDK to register a site. Once registered it will appear here and you can enable or disable it.</p>
              </div>
            ) : (sites.data?.sites ?? []).map((site) => (
              <div className="console-list-row" key={site.siteId}>
                <strong>{site.name}</strong>
                <small>{site.domain} / {site.status} / {site.siteId}</small>
                <button className="ui-button ui-button--secondary" onClick={() => void setStatus(site)} type="button">
                  {site.status === "active" ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="console-panel">
          <SectionTitle title="Recent checks" />
          <div className="console-list">
            {(logs.data?.logs ?? []).map((log) => (
              <div className="console-list-row" key={log.requestId}>
                <strong>{log.allowed ? "Allowed" : "Denied"} {log.path}</strong>
                <small>{log.domain} / {log.reason} / {log.requestId}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function AgentDetailView({ agentId }: { agentId: string }) {
  const detail = useApiResource<AgentDetail>(`/api/console/agents/${agentId}`);
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [form, setForm] = useState({
    action: "",
    maxAmount: "",
    resource: "",
    scope: "",
    allowedActions: "",
    blockedActions: "",
    expiresAt: tomorrowIsoLocal(),
    description: ""
  });

  const reload = detail.reload;

  const rotateKey = async () => {
    if (!window.confirm("Rotate this agent API key? The old key will stop working immediately.")) return;
    const result = await apiFetch<{ agentId: string; apiKey: string }>(
      `/api/console/agents/${agentId}/rotate-key`,
      { method: "POST" }
    );
    setOneTimeKey(result.apiKey);
    await reload();
  };

  const setStatus = async (status: "enable" | "disable") => {
    await apiFetch(`/api/console/agents/${agentId}/${status}`, { method: "POST" });
    await reload();
  };

  const createPermission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch(`/api/console/agents/${agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: form.action,
        description: form.description || undefined,
        resource: form.resource || undefined,
        scope: form.scope || undefined,
        allowedActions: form.allowedActions ? form.allowedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        blockedActions: form.blockedActions ? form.blockedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        constraints: {
          maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
          allowedVendors: form.resource
            ? form.resource.split(",").map((resource) => resource.trim()).filter(Boolean)
            : undefined,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined
        }
      })
    });
    await reload();
  };

  const revokePermission = async (permissionId: string) => {
    await apiFetch(`/api/console/agents/${agentId}/permissions/${permissionId}/revoke`, {
      method: "POST"
    });
    await reload();
  };

  return (
    <ResourceState resource={detail}>
      {(data) => (
        <>
          <Header
            title={data.agent.name}
            action={
              <div className="console-actions">
                <Button onClick={rotateKey} type="button">
                  Rotate key
                </Button>
                {data.agent.status === "disabled" ? (
                  <Button variant="primary" onClick={() => setStatus("enable")} type="button">
                    Enable
                  </Button>
                ) : (
                  <Button variant="danger" onClick={() => setStatus("disable")} type="button">
                    Disable
                  </Button>
                )}
              </div>
            }
          />
          <section className="console-detail">
            <div className="console-panel">
              <SectionTitle title="Agent" />
              <p className="field-help">Rotating this key invalidates the old key immediately. The new key is shown once and only its hash is stored.</p>
              <dl className="console-definition">
                <div><dt>Agent ID</dt><dd>{data.agent.agentId}</dd></div>
                <div><dt>Type</dt><dd><span className={statusClass(data.agent.agentType)}>{data.agent.agentType}</span></dd></div>
                <div><dt>Provider</dt><dd>{data.agent.provider}</dd></div>
                <div><dt>Connection</dt><dd>{data.agent.connectionStatus}</dd></div>
                <div><dt>External reference</dt><dd>{data.agent.externalAgentLabel || "Not set"}</dd></div>
                <div><dt>External ID</dt><dd>{data.agent.externalAgentId || "Not set"}</dd></div>
                <div><dt>Description</dt><dd>{data.agent.description || "Not set"}</dd></div>
                <div><dt>Status</dt><dd><span className={statusClass(data.agent.status)}>{data.agent.status}</span></dd></div>
                <div><dt>Created</dt><dd>{formatDate(data.agent.createdAt)}</dd></div>
                <div><dt>Updated</dt><dd>{formatDate(data.agent.updatedAt)}</dd></div>
                <div><dt>Last used</dt><dd>{formatDate(data.agent.lastUsedAt)}</dd></div>
                <div><dt>Key rotated</dt><dd>{formatDate(data.agent.keyRotatedAt)}</dd></div>
              </dl>
              {oneTimeKey ? <SecretBox label="Rotated API key" value={oneTimeKey} /> : null}
            </div>
            <form className="console-panel" onSubmit={createPermission}>
              <SectionTitle title="Create permission" />
              <p className="field-help">Define what an agent can do, what it can access, and what limits apply.</p>
              <label><span>Action</span><input onChange={(event) => setForm({ ...form, action: event.target.value })} placeholder="access_data, schedule, purchase" required value={form.action} /></label>
              <label><span>Resource / service</span><input onChange={(event) => setForm({ ...form, resource: event.target.value })} placeholder="gmail.com, google-calendar, coachella.com" value={form.resource} /></label>
              <label><span>Scope / constraints</span><input onChange={(event) => setForm({ ...form, scope: event.target.value })} placeholder="read labels only, require approval, max 10 records" value={form.scope} /></label>
              <label><span>Allowed actions</span><input onChange={(event) => setForm({ ...form, allowedActions: event.target.value })} placeholder="read labels, summarize docs, suggest times" value={form.allowedActions} /><small className="field-help">Comma-separated list of what this permission explicitly allows.</small></label>
              <label><span>Blocked actions</span><input onChange={(event) => setForm({ ...form, blockedActions: event.target.value })} placeholder="send email, delete files, make purchases" value={form.blockedActions} /><small className="field-help">Comma-separated list of what this agent must never do.</small></label>
              <label><span>Max amount</span><input min="0" onChange={(event) => setForm({ ...form, maxAmount: event.target.value })} placeholder="Optional, e.g. 800" type="number" value={form.maxAmount} /></label>
              <label><span>Expires at</span><input onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} type="datetime-local" value={form.expiresAt} /></label>
              <label><span>Description</span><textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} value={form.description} /></label>
              <Button variant="primary" type="submit">Create permission</Button>
            </form>
          </section>
          <section className="console-grid">
            <div>
              <SectionTitle title="Permissions" />
              <PermissionList items={data.permissions} onRevoke={revokePermission} />
            </div>
            <div>
              <SectionTitle title="Recent logs" />
              <LogList logs={data.logs} compact />
            </div>
          </section>
        </>
      )}
    </ResourceState>
  );
}

function LogsView() {
  const [agentId, setAgentId] = useState("");
  const [allowed, setAllowed] = useState("");
  const [action, setAction] = useState("");
  const [risk, setRisk] = useState("");
  const [requestId, setRequestId] = useState("");
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    if (allowed) params.set("allowed", allowed);
    if (action) params.set("action", action);
    if (risk) params.set("risk", risk);
    if (requestId) params.set("requestId", requestId);
    return `/api/console/logs${params.size ? `?${params.toString()}` : ""}`;
  }, [action, agentId, allowed, requestId, risk]);
  const logs = useApiResource<LogsResponse>(path);
  const exportHref = `${path}${path.includes("?") ? "&" : "?"}format=csv`;

  return (
    <>
      <Header title="Logs" action={<ButtonLink href={exportHref}>Export CSV</ButtonLink>} />
      <div className="console-toolbar">
        <input aria-label="Filter by agent ID" onChange={(event) => setAgentId(event.target.value)} placeholder="agent_xxx" value={agentId} />
        <select aria-label="Allowed filter" onChange={(event) => setAllowed(event.target.value)} value={allowed}>
          <option value="">All decisions</option>
          <option value="true">Allowed</option>
          <option value="false">Denied</option>
        </select>
        <input aria-label="Filter by action" onChange={(event) => setAction(event.target.value)} placeholder="action" value={action} />
        <select aria-label="Risk filter" onChange={(event) => setRisk(event.target.value)} value={risk}>
          <option value="">All risk</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input aria-label="Filter by request ID" onChange={(event) => setRequestId(event.target.value)} placeholder="req_xxx" value={requestId} />
        <Button onClick={logs.reload} type="button">Refresh</Button>
      </div>
      <ResourceState resource={logs}>
        {(data) => (
          <>
            <LogSummaryStrip summary={data.summary} />
            <LogList logs={data.logs} />
          </>
        )}
      </ResourceState>
    </>
  );
}

function WebhooksView() {
  const webhooks = useApiResource<WebhooksResponse>("/api/console/webhooks");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [oneTimeSecret, setOneTimeSecret] = useState("");

  const createWebhook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await apiFetch<{ webhook: Webhook; secret: string }>("/api/console/webhooks", {
      method: "POST",
      body: JSON.stringify({ url, events: selectedEvents })
    });
    setOneTimeSecret(result.secret);
    setUrl("");
    setSelectedEvents([]);
    await webhooks.reload();
  };

  return (
    <ResourceState resource={webhooks}>
      {(data) => (
        <>
          <Header title="Webhooks" />
          <section className="console-split">
            <div>
              <SectionTitle title="Endpoints" />
              <WebhookList webhooks={data.webhooks} />
            </div>
            <form className="console-panel" onSubmit={createWebhook}>
              <SectionTitle title="Create endpoint" />
              <label>
                <span>URL</span>
                <input onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/webhooks/behalfid" required type="url" value={url} />
              </label>
              <fieldset className="console-fieldset">
                <legend>Events</legend>
                {data.eventTypes.map((eventType) => (
                  <label className="console-check" key={eventType}>
                    <input
                      checked={selectedEvents.includes(eventType)}
                      onChange={(event) => {
                        setSelectedEvents((current) =>
                          event.target.checked
                            ? [...current, eventType]
                            : current.filter((item) => item !== eventType)
                        );
                      }}
                      type="checkbox"
                    />
                    <span>{eventType}</span>
                  </label>
                ))}
              </fieldset>
              <Button variant="primary" type="submit">Create webhook</Button>
              {oneTimeSecret ? <SecretBox label="Signing secret" value={oneTimeSecret} /> : null}
            </form>
          </section>
        </>
      )}
    </ResourceState>
  );
}

function WebhookDetailView({ webhookId }: { webhookId: string }) {
  const detail = useApiResource<WebhookDetail>(`/api/console/webhooks/${webhookId}`);
  const [oneTimeSecret, setOneTimeSecret] = useState("");

  const setStatus = async (status: "enable" | "disable") => {
    await apiFetch(`/api/console/webhooks/${webhookId}/${status}`, { method: "POST" });
    await detail.reload();
  };

  const rotateSecret = async () => {
    const result = await apiFetch<{ webhookId: string; secret: string }>(
      `/api/console/webhooks/${webhookId}/rotate-secret`,
      { method: "POST" }
    );
    setOneTimeSecret(result.secret);
    await detail.reload();
  };

  return (
    <ResourceState resource={detail}>
      {(data) => (
        <>
          <Header
            title="Webhook"
            action={
              <div className="console-actions">
                <Button onClick={rotateSecret} type="button">Rotate secret</Button>
                {data.webhook.status === "disabled" ? (
                  <Button variant="primary" onClick={() => setStatus("enable")} type="button">Enable</Button>
                ) : (
                  <Button variant="danger" onClick={() => setStatus("disable")} type="button">Disable</Button>
                )}
              </div>
            }
          />
          <section className="console-detail">
            <div className="console-panel">
              <SectionTitle title="Endpoint" />
              <dl className="console-definition">
                <div><dt>Webhook ID</dt><dd>{data.webhook.webhookId}</dd></div>
                <div><dt>URL</dt><dd>{data.webhook.url}</dd></div>
                <div><dt>Status</dt><dd><span className={statusClass(data.webhook.status)}>{data.webhook.status}</span></dd></div>
                <div><dt>Secret</dt><dd>{data.webhook.secretPreview}</dd></div>
                <div><dt>Last triggered</dt><dd>{formatDate(data.webhook.lastTriggeredAt)}</dd></div>
              </dl>
              {oneTimeSecret ? <SecretBox label="Rotated signing secret" value={oneTimeSecret} /> : null}
            </div>
            <div className="console-panel">
              <SectionTitle title="Subscribed events" />
              <ul className="console-bullets">
                {data.webhook.events.map((eventType) => <li key={eventType}>{eventType}</li>)}
              </ul>
            </div>
          </section>
          <SectionTitle title="Recent deliveries" />
          <DeliveryList deliveries={data.deliveries} />
        </>
      )}
    </ResourceState>
  );
}

function WebhookEventsView() {
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [deadLetter, setDeadLetter] = useState(false);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (eventType) params.set("type", eventType);
    if (deadLetter) params.set("deadLetter", "true");
    return params.toString();
  }, [deadLetter, eventType, status]);
  const events = useApiResource<WebhookEventsResponse>(
    `/api/console/webhook-events${query ? `?${query}` : ""}`
  );

  return (
    <ResourceState resource={events}>
      {(data) => (
        <>
          <Header
            title="Webhook events"
            action={<Button onClick={events.reload} type="button">Refresh</Button>}
          />
          <div className="console-filters">
            <select aria-label="Webhook event status" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <input aria-label="Filter by event type" onChange={(event) => setEventType(event.target.value)} placeholder="verification.denied" value={eventType} />
            <label className="console-check">
              <input checked={deadLetter} onChange={(event) => setDeadLetter(event.target.checked)} type="checkbox" />
              <span>Dead letter only</span>
            </label>
          </div>
          <WebhookEventList events={data.events} />
        </>
      )}
    </ResourceState>
  );
}

function WebhookEventDetailView({ eventId }: { eventId: string }) {
  const detail = useApiResource<WebhookEventDetail>(`/api/console/webhook-events/${eventId}`);

  const replay = async () => {
    await apiFetch(`/api/console/webhook-events/${eventId}/replay`, { method: "POST" });
    await detail.reload();
  };

  return (
    <ResourceState resource={detail}>
      {(data) => (
        <>
          <Header
            title="Webhook event"
            action={
              data.event.status !== "completed" ? (
                <Button variant="primary" onClick={replay} type="button">Replay</Button>
              ) : null
            }
          />
          <section className="console-detail">
            <div className="console-panel">
              <SectionTitle title="Event" />
              <dl className="console-definition">
                <div><dt>Event ID</dt><dd>{data.event.eventId}</dd></div>
                <div><dt>Type</dt><dd>{data.event.type}</dd></div>
                <div><dt>Status</dt><dd><span className={statusClass(data.event.status)}>{data.event.status}</span></dd></div>
                <div><dt>Dead letter</dt><dd>{data.event.deadLetter ? "yes" : "no"}</dd></div>
                <div><dt>Attempts</dt><dd>{data.event.attempts}</dd></div>
                <div><dt>Next attempt</dt><dd>{formatDate(data.event.nextAttemptAt)}</dd></div>
                <div><dt>Completed</dt><dd>{formatDate(data.event.completedAt)}</dd></div>
                <div><dt>Last error</dt><dd>{data.event.lastError || "None"}</dd></div>
              </dl>
            </div>
            <div className="console-panel">
              <SectionTitle title="Payload" />
              <CodeBlock className="console-code">{JSON.stringify(data.event.payload, null, 2)}</CodeBlock>
            </div>
          </section>
          <SectionTitle title="Delivery attempts" />
          <DeliveryList deliveries={data.deliveries} />
        </>
      )}
    </ResourceState>
  );
}

function SettingsView() {
  const settings = useApiResource<Settings>("/api/console/settings");

  return (
    <ResourceState resource={settings}>
      {(data) => (
        <>
          <Header title="Settings" />
          {data.rateLimitMode === "memory" && data.environment !== "development" && (
            <div className="console-alert" role="alert">
              <span className="console-alert__icon">⚠</span>
              <div>
                <strong>Rate limiting is process-local</strong>
                <p>Rate limits reset on every server restart and do not apply across multiple processes. Configure Upstash Redis before exposing this instance publicly.</p>
              </div>
            </div>
          )}
          <section className="console-settings">
            <dl className="console-definition">
              <div><dt>App URL</dt><dd>{data.appUrl}</dd></div>
              <div><dt>Environment</dt><dd>{data.environment}</dd></div>
              <div><dt>MongoDB configured</dt><dd>{data.mongoConfigured ? "yes" : "no"}</dd></div>
              <div><dt>DB health</dt><dd>{data.mongoStatus}</dd></div>
              <div><dt>Public creation</dt><dd>{data.publicAgentCreation}</dd></div>
              <div><dt>Setup token</dt><dd>{data.setupTokenConfigured ? "configured" : "not configured"}</dd></div>
              <div><dt>Rate limit mode</dt><dd>{data.rateLimitMode}</dd></div>
              <div><dt>Metadata logging</dt><dd>{data.metadataLogging}</dd></div>
            </dl>
            {data.securityWarnings.length ? (
              <>
                <SectionTitle title="Security warnings" />
                <ul className="console-bullets">
                  {data.securityWarnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            ) : null}
            <SectionTitle title="Known limitations" />
            <ul className="console-bullets">
              {data.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </>
      )}
    </ResourceState>
  );
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return <PageHeader eyebrow="Console" title={title} action={action} className="console-header" />;
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="console-section-title">{title}</h2>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <StatCard label={label} value={value} />;
}

function AgentTable({ agents }: { agents: Agent[] }) {
  if (!agents.length) return <EmptyState className="console-empty">No agents found.</EmptyState>;
  return (
    <div className="console-table">
      {agents.map((agent) => (
        <Link className="console-row" href={`/console/agents/${agent.agentId}`} key={agent.agentId}>
          <span>
            <strong>{agent.name}</strong>
            <small>{agent.agentId} / {agent.agentType} / {agent.provider} / {agent.connectionStatus}</small>
          </span>
          <span className={statusClass(agent.status)}>{agent.status}</span>
          <span>{formatDate(agent.updatedAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function WebhookList({ webhooks }: { webhooks: Webhook[] }) {
  if (!webhooks.length) return <EmptyState className="console-empty">No webhooks configured.</EmptyState>;
  return (
    <div className="console-table">
      {webhooks.map((webhook) => (
        <Link className="console-row" href={`/console/webhooks/${webhook.webhookId}`} key={webhook.webhookId}>
          <span>
            <strong>{webhook.url}</strong>
            <small>{webhook.events.join(", ")}</small>
          </span>
          <span className={statusClass(webhook.status)}>{webhook.status}</span>
          <span>{formatDate(webhook.lastTriggeredAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function DeliveryList({ deliveries }: { deliveries: WebhookDelivery[] }) {
  if (!deliveries.length) return <EmptyState className="console-empty">No delivery attempts yet.</EmptyState>;
  return (
    <div className="console-list">
      {deliveries.map((delivery) => (
        <div className="console-list__item" key={delivery.deliveryId}>
          <span>
            <strong>{delivery.eventType}</strong>
            <small>{delivery.eventId}{delivery.error ? ` / ${delivery.error}` : ""}</small>
            <small>Attempt {delivery.attempt}{delivery.maxAttempts ? ` of ${delivery.maxAttempts}` : ""}{delivery.nextRetryAt ? ` / retry ${formatDate(delivery.nextRetryAt)}` : ""}</small>
          </span>
          <span className={statusClass(delivery.status)}>{delivery.status}</span>
          <span>{delivery.httpStatus ?? "no status"}</span>
        </div>
      ))}
    </div>
  );
}

function WebhookEventList({ events }: { events: WebhookEventRecord[] }) {
  if (!events.length) return <EmptyState className="console-empty">No webhook events queued yet.</EmptyState>;
  return (
    <div className="console-table">
      {events.map((event) => (
        <Link className="console-row" href={`/console/webhook-events/${event.eventId}`} key={event.eventId}>
          <span>
            <strong>{event.type}</strong>
            <small>{event.eventId}{event.lastError ? ` / ${event.lastError}` : ""}</small>
          </span>
          <span className={statusClass(event.status)}>{event.status}</span>
          <span>{event.deadLetter ? "Dead letter" : `Attempts ${event.attempts}`}</span>
          <span>{event.nextAttemptAt ? formatDate(event.nextAttemptAt) : "no retry scheduled"}</span>
        </Link>
      ))}
    </div>
  );
}

function PermissionList({ items, onRevoke }: { items: Permission[]; onRevoke: (id: string) => void }) {
  if (!items.length) return <EmptyState className="console-empty">No permissions created.</EmptyState>;
  return (
    <div className="console-list">
      {items.map((item) => (
        <div className="console-list__item" key={item.permissionId}>
          <span>
            <strong>{item.action}</strong>
            <small>{permissionSummary(item)}</small>
          </span>
          <span className={statusClass(item.status)}>{item.status}</span>
          {item.status === "active" ? (
            <Button variant="danger" onClick={() => onRevoke(item.permissionId)} type="button">
              Revoke
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LogList({ logs, compact = false }: { logs: VerificationLog[]; compact?: boolean }) {
  if (!logs.length) return <EmptyState className="console-empty">No logs found.</EmptyState>;
  return (
    <div className={compact ? "console-list console-list--compact" : "console-list console-log-list"}>
      {logs.map((log) => (
        <div className="console-list__item" key={log.requestId}>
          <span>
            <strong>{log.action}</strong>
            <small>{log.agentName || log.agentId} / {log.vendor || "no resource"}{typeof log.amount === "number" ? ` / $${log.amount}` : ""}</small>
            <small>{log.reason}</small>
            {!compact ? <small>{log.requestId} / account {log.accountId ?? "unknown"} / developer {log.developerUserId ?? "unknown"}</small> : null}
          </span>
          <span className={statusClass(log.allowed ? "allowed" : "denied")}>
            {log.allowed ? "allowed" : "denied"}
          </span>
          {!compact ? <span className={statusClass(log.risk)}>{log.risk}</span> : null}
          <span>{formatDate(log.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function LogSummaryStrip({ summary }: { summary: LogSummary }) {
  return (
    <section className="console-metrics console-log-summary" aria-label="Log summary">
      <Metric label="Total" value={summary.total} />
      <Metric label="Allowed" value={summary.allowed} />
      <Metric label="Denied" value={summary.denied} />
      <Metric label="High risk" value={summary.highRisk} />
      <Metric label="Approval required" value={summary.approvalRequired} />
      <Metric label="Top vendor" value={summary.topVendor ?? "None"} />
    </section>
  );
}

function SecretBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="console-secret">
      <strong>{label}</strong>
      <p>This key is shown once. Store it now; the old key stops working after rotation.</p>
      <code>{value}</code>
      <Button onClick={copy} type="button">
        {copied ? "Copied" : "Copy key"}
      </Button>
    </div>
  );
}

function permissionSummary(permission: Permission) {
  const constraints = permission.constraints ?? {};
  const parts = [
    permission.resource ? `on ${permission.resource}` : null,
    permission.allowedActions?.length ? `allows: ${permission.allowedActions.join(", ")}` : (permission.scope ?? null),
    typeof constraints.maxAmount === "number" ? `max $${constraints.maxAmount}` : null,
    permission.requiresApproval ? "requires approval" : null,
    permission.blockedActions?.length ? `blocks: ${permission.blockedActions.join(", ")}` : null,
    !permission.resource && constraints.allowedVendors?.length ? constraints.allowedVendors.join(", ") : null,
    constraints.expiresAt ? `expires ${formatDate(constraints.expiresAt)}` : null
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : permission.notes || permission.description || permission.permissionId;
}

// ─── Enterprise Inquiries ──────────────────────────────────────────────────────

type EnterpriseInquiry = {
  inquiryId: string;
  name: string;
  email: string;
  company: string;
  message: string;
  status: "new" | "reviewed";
  createdAt?: string;
};

type EnterpriseInquiriesResponse = { inquiries: EnterpriseInquiry[] };

function EnterpriseInquiriesView() {
  const resource = useApiResource<EnterpriseInquiriesResponse>("/api/console/enterprise-inquiries");
  const [updating, setUpdating] = useState<string | null>(null);

  const markReviewed = async (inquiryId: string) => {
    setUpdating(inquiryId);
    try {
      await apiFetch(`/api/console/enterprise-inquiries/${inquiryId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "reviewed" })
      });
      await resource.reload();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <ResourceState resource={resource}>
      {(data) => {
        const newCount = data.inquiries.filter((i) => i.status === "new").length;
        return (
          <>
            <Header
              title="Enterprise Inquiries"
              action={<Button onClick={resource.reload} type="button">Refresh</Button>}
            />
            {newCount > 0 && (
              <div className="console-alert" role="status">
                <span className="console-alert__icon">📬</span>
                <div>
                  <strong>{newCount} new {newCount === 1 ? "inquiry" : "inquiries"}</strong>
                  <p>Review and mark each one as reviewed when actioned.</p>
                </div>
              </div>
            )}
            {data.inquiries.length === 0 ? (
              <EmptyState className="console-empty">No enterprise inquiries yet.</EmptyState>
            ) : (
              <div className="console-list">
                {data.inquiries.map((inquiry) => (
                  <div className="console-list__item" key={inquiry.inquiryId}>
                    <span>
                      <strong>{inquiry.company} — {inquiry.name}</strong>
                      <small>{inquiry.email}</small>
                      {inquiry.message && <small>{inquiry.message}</small>}
                      <small>{inquiry.inquiryId} · {formatDate(inquiry.createdAt)}</small>
                    </span>
                    <span className={statusClass(inquiry.status === "new" ? "active" : "disabled")}>
                      {inquiry.status}
                    </span>
                    {inquiry.status === "new" && (
                      <Button
                        type="button"
                        disabled={updating === inquiry.inquiryId}
                        onClick={() => void markReviewed(inquiry.inquiryId)}
                      >
                        {updating === inquiry.inquiryId ? "Saving…" : "Mark reviewed"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }}
    </ResourceState>
  );
}

// ─── Status Page Management ────────────────────────────────────────────────────

type ComponentStatus = "operational" | "performance_issues" | "partial_outage" | "major_outage";
type IncidentStatus = "investigating" | "identified" | "watching" | "fixed";
type IncidentSeverity = "minor" | "major" | "critical";

type StatusComponent = {
  componentId: string;
  name: string;
  description?: string | null;
  group?: string | null;
  sortOrder: number;
  status: ComponentStatus;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type IncidentUpdate = {
  _id?: string;
  body: string;
  status: IncidentStatus;
  createdAt?: string;
};

type StatusIncident = {
  incidentId: string;
  title: string;
  message?: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  componentIds: string[];
  updates: IncidentUpdate[];
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type StatusComponentsResponse = { components: StatusComponent[] };
type StatusIncidentsResponse = { incidents: StatusIncident[] };

const COMPONENT_STATUS_OPTIONS: [ComponentStatus, string][] = [
  ["operational", "Operational"],
  ["performance_issues", "Performance Issues"],
  ["partial_outage", "Partial Outage"],
  ["major_outage", "Major Outage"]
];

const INCIDENT_STATUS_OPTIONS: [IncidentStatus, string][] = [
  ["investigating", "Investigating"],
  ["identified", "Identified"],
  ["watching", "Monitoring"],
  ["fixed", "Resolved"]
];

const SEVERITY_OPTIONS: [IncidentSeverity, string][] = [
  ["minor", "Minor"],
  ["major", "Major"],
  ["critical", "Critical"]
];

function componentStatusLabel(status: ComponentStatus): string {
  return COMPONENT_STATUS_OPTIONS.find(([v]) => v === status)?.[1] ?? status;
}

function incidentStatusLabel(status: IncidentStatus): string {
  return INCIDENT_STATUS_OPTIONS.find(([v]) => v === status)?.[1] ?? status;
}

function severityLabel(severity: IncidentSeverity): string {
  return SEVERITY_OPTIONS.find(([v]) => v === severity)?.[1] ?? severity;
}

function componentStatusCls(status: ComponentStatus): string {
  switch (status) {
    case "operational": return "console-status console-status--active";
    case "performance_issues": return "console-status console-status--medium";
    case "partial_outage": return "console-status console-status--approval";
    case "major_outage": return "console-status console-status--denied";
  }
}

function incidentStatusCls(status: IncidentStatus): string {
  switch (status) {
    case "investigating": return "console-status console-status--denied";
    case "identified": return "console-status console-status--approval";
    case "watching": return "console-status console-status--medium";
    case "fixed": return "console-status console-status--active";
  }
}

function StatusView() {
  const { data: compData, loading: compLoading, error: compError, reload: reloadComps } =
    useApiResource<StatusComponentsResponse>("/api/console/status/components");
  const { data: incData, loading: incLoading, error: incError, reload: reloadIncs } =
    useApiResource<StatusIncidentsResponse>("/api/console/status/incidents");
  const { data: eventsData } =
    useApiResource<WebhookEventsResponse>("/api/console/webhook-events?status=pending");

  const [activeTab, setActiveTab] = useState<"components" | "incidents">("components");

  const staleEvents = useMemo(() => {
    if (!eventsData?.events.length) return 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return eventsData.events.filter((e) => e.createdAt && new Date(e.createdAt).getTime() < oneHourAgo).length;
  }, [eventsData]);

  // Seed state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ created: number; skipped: number } | null>(null);

  const handleSeed = useCallback(async () => {
    if (!confirm("Populate the status page with default BehalfID service components? Existing components are not overwritten.")) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await apiFetch<{ created: number; skipped: number }>("/api/console/status/seed", { method: "POST" });
      setSeedResult(result);
      void reloadComps();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSeeding(false);
    }
  }, [reloadComps]);

  // Component form state
  const [showCompForm, setShowCompForm] = useState(false);
  const [compForm, setCompForm] = useState({ name: "", description: "", group: "", sortOrder: "0", status: "operational" as ComponentStatus });
  const [compSubmitting, setCompSubmitting] = useState(false);
  const [compFormError, setCompFormError] = useState<string | null>(null);
  const [editingComp, setEditingComp] = useState<StatusComponent | null>(null);

  // Incident form state
  const [showIncForm, setShowIncForm] = useState(false);
  const [incForm, setIncForm] = useState({ title: "", message: "", status: "investigating" as IncidentStatus, severity: "minor" as IncidentSeverity, componentIds: "" });
  const [incSubmitting, setIncSubmitting] = useState(false);
  const [incFormError, setIncFormError] = useState<string | null>(null);
  const [editingInc, setEditingInc] = useState<StatusIncident | null>(null);

  // Update form state
  const [updatingInc, setUpdatingInc] = useState<StatusIncident | null>(null);
  const [updateBody, setUpdateBody] = useState("");
  const [updateStatus, setUpdateStatus] = useState<IncidentStatus>("watching");
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleSaveComponent = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setCompSubmitting(true);
    setCompFormError(null);
    try {
      const payload = {
        name: compForm.name,
        description: compForm.description || undefined,
        group: compForm.group || undefined,
        sortOrder: parseInt(compForm.sortOrder) || 0,
        status: compForm.status
      };
      if (editingComp) {
        await apiFetch(`/api/console/status/components/${editingComp.componentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/api/console/status/components", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setShowCompForm(false);
      setEditingComp(null);
      setCompForm({ name: "", description: "", group: "", sortOrder: "0", status: "operational" });
      void reloadComps();
    } catch (err) {
      setCompFormError((err as Error).message);
    } finally {
      setCompSubmitting(false);
    }
  }, [compForm, editingComp, reloadComps]);

  const handleDeleteComponent = useCallback(async (componentId: string) => {
    if (!confirm("Delete this component? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/console/status/components/${componentId}`, { method: "DELETE" });
      void reloadComps();
    } catch (err) {
      alert((err as Error).message);
    }
  }, [reloadComps]);

  const startEditComponent = useCallback((comp: StatusComponent) => {
    setEditingComp(comp);
    setCompForm({
      name: comp.name,
      description: comp.description ?? "",
      group: comp.group ?? "",
      sortOrder: String(comp.sortOrder),
      status: comp.status
    });
    setCompFormError(null);
    setShowCompForm(true);
  }, []);

  const handleSaveIncident = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setIncSubmitting(true);
    setIncFormError(null);
    try {
      const componentIds = incForm.componentIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title: incForm.title,
        message: incForm.message || undefined,
        status: incForm.status,
        severity: incForm.severity,
        componentIds
      };
      if (editingInc) {
        await apiFetch(`/api/console/status/incidents/${editingInc.incidentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/api/console/status/incidents", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setShowIncForm(false);
      setEditingInc(null);
      setIncForm({ title: "", message: "", status: "investigating", severity: "minor", componentIds: "" });
      void reloadIncs();
    } catch (err) {
      setIncFormError((err as Error).message);
    } finally {
      setIncSubmitting(false);
    }
  }, [incForm, editingInc, reloadIncs]);

  const handleDeleteIncident = useCallback(async (incidentId: string) => {
    if (!confirm("Delete this incident? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/console/status/incidents/${incidentId}`, { method: "DELETE" });
      void reloadIncs();
    } catch (err) {
      alert((err as Error).message);
    }
  }, [reloadIncs]);

  const startEditIncident = useCallback((inc: StatusIncident) => {
    setEditingInc(inc);
    setIncForm({
      title: inc.title,
      message: inc.message ?? "",
      status: inc.status,
      severity: inc.severity,
      componentIds: inc.componentIds.join(", ")
    });
    setIncFormError(null);
    setShowIncForm(true);
  }, []);

  const handlePostUpdate = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!updatingInc) return;
    setUpdateSubmitting(true);
    setUpdateError(null);
    try {
      await apiFetch(`/api/console/status/incidents/${updatingInc.incidentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: updateStatus, updateBody })
      });
      setUpdatingInc(null);
      setUpdateBody("");
      void reloadIncs();
    } catch (err) {
      setUpdateError((err as Error).message);
    } finally {
      setUpdateSubmitting(false);
    }
  }, [updatingInc, updateStatus, updateBody, reloadIncs]);

  const components = compData?.components ?? [];
  const incidents = incData?.incidents ?? [];

  return (
    <div className="console-view">
      <Header
        title="Status Page"
        action={<a href="/status" target="_blank" rel="noreferrer" className="ui-button ui-button--secondary">View public page ↗</a>}
      />

      {staleEvents > 0 && (
        <div className="console-alert" role="alert">
          <span className="console-alert__icon">⚠</span>
          <div>
            <strong>Webhook delivery may be degraded</strong>
            <p>{staleEvents} event{staleEvents !== 1 ? "s" : ""} have been stuck in Pending for over an hour. The Webhook Delivery component status may not reflect reality — consider updating it to Partial Outage or Major Outage and creating an incident. <a href="/console/webhook-events">View event queue →</a></p>
          </div>
        </div>
      )}

      <div className="console-tabs" role="tablist" aria-label="Status management">
        <button
          role="tab"
          aria-selected={activeTab === "components"}
          className={`console-tab${activeTab === "components" ? " console-tab--active" : ""}`}
          onClick={() => setActiveTab("components")}
          type="button"
        >
          Components
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "incidents"}
          className={`console-tab${activeTab === "incidents" ? " console-tab--active" : ""}`}
          onClick={() => setActiveTab("incidents")}
          type="button"
        >
          Incidents
        </button>
      </div>

      {/* Components Tab */}
      {activeTab === "components" && (
        <div className="console-tab-panel" role="tabpanel">
          <div className="console-section-header">
            <h2 className="console-section-title">Service Components</h2>
            <div className="console-section-header__actions">
              <Button type="button" onClick={() => void handleSeed()} disabled={seeding}>
                {seeding ? "Seeding…" : "Seed defaults"}
              </Button>
              <Button type="button" onClick={() => { setEditingComp(null); setCompForm({ name: "", description: "", group: "", sortOrder: "0", status: "operational" }); setCompFormError(null); setShowCompForm(true); }}>
                Add Component
              </Button>
            </div>
          </div>
          {seedResult && (
            <p className="console-seed-result">
              ✓ Seeded: {seedResult.created} created, {seedResult.skipped} already existed.
            </p>
          )}

          {showCompForm && (
            <form className="console-form" onSubmit={handleSaveComponent}>
              <h3 className="console-form__title">{editingComp ? "Edit Component" : "New Component"}</h3>
              {compFormError && <p className="console-form__error">{compFormError}</p>}
              <label className="console-form__label">
                Name <span aria-hidden="true">*</span>
                <input
                  className="ui-input"
                  value={compForm.name}
                  onChange={(e) => setCompForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. API Gateway"
                  maxLength={120}
                  required
                />
              </label>
              <label className="console-form__label">
                Description
                <input
                  className="ui-input"
                  value={compForm.description}
                  onChange={(e) => setCompForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional short description"
                  maxLength={500}
                />
              </label>
              <label className="console-form__label">
                Group
                <input
                  className="ui-input"
                  value={compForm.group}
                  onChange={(e) => setCompForm((f) => ({ ...f, group: e.target.value }))}
                  placeholder="e.g. Core Services"
                  maxLength={80}
                />
              </label>
              <label className="console-form__label">
                Sort Order
                <input
                  className="ui-input"
                  type="number"
                  value={compForm.sortOrder}
                  onChange={(e) => setCompForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  min={0}
                  max={9999}
                />
              </label>
              <label className="console-form__label">
                Status
                <select
                  className="ui-input"
                  value={compForm.status}
                  onChange={(e) => setCompForm((f) => ({ ...f, status: e.target.value as ComponentStatus }))}
                >
                  {COMPONENT_STATUS_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="console-form__actions">
                <Button type="submit" disabled={compSubmitting}>
                  {compSubmitting ? "Saving…" : (editingComp ? "Save Changes" : "Create Component")}
                </Button>
                <Button type="button" onClick={() => { setShowCompForm(false); setEditingComp(null); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {compLoading && <p className="console-loading">Loading components…</p>}
          {compError && <p className="console-error">Error: {compError.message}</p>}
          {!compLoading && !compError && components.length === 0 && (
            <EmptyState className="console-empty">No components yet. Add one above.</EmptyState>
          )}
          {!compLoading && components.length > 0 && (
            <div className="console-list">
              {components.map((comp) => (
                <div className="console-list__item" key={comp.componentId}>
                  <span>
                    <strong>{comp.name}</strong>
                    {comp.group && <small>Group: {comp.group}</small>}
                    {comp.description && <small>{comp.description}</small>}
                    <small>Sort order: {comp.sortOrder} · {comp.enabled ? "Enabled" : "Disabled"}</small>
                  </span>
                  <span className={componentStatusCls(comp.status)}>{componentStatusLabel(comp.status)}</span>
                  <span className="console-list__actions">
                    <button className="ui-button ui-button--ghost" type="button" onClick={() => startEditComponent(comp)}>Edit</button>
                    <button className="ui-button ui-button--ghost" type="button" onClick={() => void handleDeleteComponent(comp.componentId)}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incidents Tab */}
      {activeTab === "incidents" && (
        <div className="console-tab-panel" role="tabpanel">
          <div className="console-section-header">
            <h2 className="console-section-title">Incidents</h2>
            <Button type="button" onClick={() => { setEditingInc(null); setIncForm({ title: "", message: "", status: "investigating", severity: "minor", componentIds: "" }); setIncFormError(null); setShowIncForm(true); }}>
              Create Incident
            </Button>
          </div>

          {showIncForm && (
            <form className="console-form" onSubmit={handleSaveIncident}>
              <h3 className="console-form__title">{editingInc ? "Edit Incident" : "New Incident"}</h3>
              {incFormError && <p className="console-form__error">{incFormError}</p>}
              <label className="console-form__label">
                Title <span aria-hidden="true">*</span>
                <input
                  className="ui-input"
                  value={incForm.title}
                  onChange={(e) => setIncForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Elevated error rates on API"
                  maxLength={200}
                  required
                />
              </label>
              <label className="console-form__label">
                Initial message
                <textarea
                  className="ui-input"
                  value={incForm.message}
                  onChange={(e) => setIncForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Describe what is happening…"
                  maxLength={2000}
                  rows={3}
                />
              </label>
              <label className="console-form__label">
                Status
                <select
                  className="ui-input"
                  value={incForm.status}
                  onChange={(e) => setIncForm((f) => ({ ...f, status: e.target.value as IncidentStatus }))}
                >
                  {INCIDENT_STATUS_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="console-form__label">
                Severity
                <select
                  className="ui-input"
                  value={incForm.severity}
                  onChange={(e) => setIncForm((f) => ({ ...f, severity: e.target.value as IncidentSeverity }))}
                >
                  {SEVERITY_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="console-form__label">
                Affected component IDs (comma-separated)
                <input
                  className="ui-input"
                  value={incForm.componentIds}
                  onChange={(e) => setIncForm((f) => ({ ...f, componentIds: e.target.value }))}
                  placeholder="componentId1, componentId2"
                />
              </label>
              <div className="console-form__actions">
                <Button type="submit" disabled={incSubmitting}>
                  {incSubmitting ? "Saving…" : (editingInc ? "Save Changes" : "Create Incident")}
                </Button>
                <Button type="button" onClick={() => { setShowIncForm(false); setEditingInc(null); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Post Update form */}
          {updatingInc && (
            <form className="console-form" onSubmit={handlePostUpdate}>
              <h3 className="console-form__title">Post Update — {updatingInc.title}</h3>
              {updateError && <p className="console-form__error">{updateError}</p>}
              <label className="console-form__label">
                Update message <span aria-hidden="true">*</span>
                <textarea
                  className="ui-input"
                  value={updateBody}
                  onChange={(e) => setUpdateBody(e.target.value)}
                  placeholder="Describe the latest status…"
                  maxLength={2000}
                  rows={3}
                  required
                />
              </label>
              <label className="console-form__label">
                New status
                <select
                  className="ui-input"
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as IncidentStatus)}
                >
                  {INCIDENT_STATUS_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="console-form__actions">
                <Button type="submit" disabled={updateSubmitting}>
                  {updateSubmitting ? "Posting…" : "Post Update"}
                </Button>
                <Button type="button" onClick={() => setUpdatingInc(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {incLoading && <p className="console-loading">Loading incidents…</p>}
          {incError && <p className="console-error">Error: {incError.message}</p>}
          {!incLoading && !incError && incidents.length === 0 && (
            <EmptyState className="console-empty">No incidents yet.</EmptyState>
          )}
          {!incLoading && incidents.length > 0 && (
            <div className="console-list">
              {incidents.map((inc) => (
                <div className="console-list__item" key={inc.incidentId}>
                  <span>
                    <strong>{inc.title}</strong>
                    <small>{formatDate(inc.createdAt)}</small>
                    <small>{inc.updates.length} update{inc.updates.length !== 1 ? "s" : ""}</small>
                    {inc.resolvedAt && <small>Resolved {formatDate(inc.resolvedAt)}</small>}
                  </span>
                  <span className={incidentStatusCls(inc.status)}>{incidentStatusLabel(inc.status)}</span>
                  <span className="console-status console-status--medium">{severityLabel(inc.severity)}</span>
                  <span className="console-list__actions">
                    <button className="ui-button ui-button--ghost" type="button" onClick={() => { setUpdatingInc(inc); setUpdateBody(""); setUpdateStatus(inc.status); setUpdateError(null); }}>
                      Post Update
                    </button>
                    <button className="ui-button ui-button--ghost" type="button" onClick={() => startEditIncident(inc)}>Edit</button>
                    <button className="ui-button ui-button--ghost" type="button" onClick={() => void handleDeleteIncident(inc.incidentId)}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
