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

export function ConsolePage({ view }: { view: "dashboard" | "agents" | "site-guard" | "webhooks" | "webhook-events" | "logs" | "settings" }) {
  return (
    <ConsoleFrame>
      {view === "dashboard" ? <DashboardView /> : null}
      {view === "agents" ? <AgentsView /> : null}
      {view === "site-guard" ? <SiteGuardView /> : null}
      {view === "webhooks" ? <WebhooksView /> : null}
      {view === "webhook-events" ? <WebhookEventsView /> : null}
      {view === "logs" ? <LogsView /> : null}
      {view === "settings" ? <SettingsView /> : null}
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
          <section className="console-metrics">
            <StatCard label="Total agents" value={data.totalAgents} />
            <StatCard label="Active permissions" value={data.activePermissions} />
            <StatCard label="Logs today" value={data.logsToday} />
            <Metric
              label="Last result"
              value={data.lastVerification ? (data.lastVerification.allowed ? "Allowed" : "Denied") : "None"}
            />
          </section>
          <section>
            <SectionTitle title="Last verification" />
            {data.lastVerification ? <LogList logs={[data.lastVerification]} /> : <EmptyState className="console-empty">No verification logs yet.</EmptyState>}
          </section>
        </>
      )}
    </ResourceState>
  );
}

function AgentsView() {
  const agents = useApiResource<AgentsResponse>("/api/console/agents");
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState<Agent["agentType"]>("native");
  const [provider, setProvider] = useState("custom");
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiFetch<{ agent: Agent; apiKey: string }>("/api/console/agents", {
        method: "POST",
        body: JSON.stringify({ name, agentType, provider })
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
      {(data) => (
        <>
          <Header title="Agents" />
          <section className="console-split">
            <div>
              <SectionTitle title="Agents" />
              <AgentTable agents={data.agents} />
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
              <Button variant="primary" disabled={submitting} type="submit">
                {submitting ? "Adding" : "Add agent"}
              </Button>
              {oneTimeKey ? <SecretBox label="New API key" value={oneTimeKey} /> : null}
            </form>
          </section>
        </>
      )}
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
            {(sites.data?.sites ?? []).map((site) => (
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
              data.event.deadLetter ? (
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
