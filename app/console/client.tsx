"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Agent = {
  agentId: string;
  name: string;
  status: "active" | "disabled";
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Permission = {
  permissionId: string;
  action: string;
  description?: string;
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
  agentId: string;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
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
type LogsResponse = { logs: VerificationLog[] };
type Settings = {
  appUrl: string;
  mongoStatus: string;
  rateLimiting: string;
  limitations: string[];
};

type ApiError = Error & { status?: number };

const navItems = [
  { href: "/console", label: "Dashboard" },
  { href: "/console/agents", label: "Agents" },
  { href: "/console/logs", label: "Logs" },
  { href: "/console/settings", label: "Settings" }
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
    <main className="console-login-page">
      <LoginPanel onSuccess={() => router.push("/console")} />
    </main>
  );
}

export function ConsolePage({ view }: { view: "dashboard" | "agents" | "logs" | "settings" }) {
  return (
    <ConsoleFrame>
      {view === "dashboard" ? <DashboardView /> : null}
      {view === "agents" ? <AgentsView /> : null}
      {view === "logs" ? <LogsView /> : null}
      {view === "settings" ? <SettingsView /> : null}
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
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await apiFetch("/api/console/logout", { method: "POST" }).catch(() => undefined);
    router.push("/console/login");
  };

  return (
    <main className="console-shell">
      <aside className="console-sidebar">
        <Link className="console-brand" href="/console" aria-label="BehalfID console">
          <span className="console-brand__mark">B</span>
          <span>
            <strong>BehalfID</strong>
            <small>Developer console</small>
          </span>
        </Link>
        <nav className="console-nav" aria-label="Console">
          {navItems.map((item) => (
            <Link
              aria-current={pathname === item.href ? "page" : undefined}
              className="console-nav__item"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button className="console-ghost-button" onClick={logout} type="button">
          Logout
        </button>
      </aside>
      <section className="console-workspace">{children}</section>
    </main>
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
    <div className="console-login">
      <form className="console-login__panel" onSubmit={submit}>
        <p className="console-kicker">Console access</p>
        <h1>BehalfID</h1>
        <p className="console-muted">Identity and permissions for AI agents.</p>
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
        {error ? <p className="console-error">{error}</p> : null}
        <button className="console-primary-button" disabled={submitting} type="submit">
          {submitting ? "Signing in" : "Sign in"}
        </button>
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
  if (resource.loading) return <div className="console-empty">Loading</div>;
  if (resource.error?.status === 401) {
    return <div className="console-empty">Session expired. Sign in again.</div>;
  }
  if (resource.error) return <div className="console-empty">{resource.error.message}</div>;
  if (!resource.data) return <div className="console-empty">No data available.</div>;
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
              <Link className="console-primary-button" href="/console/agents">
                Manage agents
              </Link>
            }
          />
          <section className="console-metrics">
            <Metric label="Total agents" value={data.totalAgents} />
            <Metric label="Active permissions" value={data.activePermissions} />
            <Metric label="Logs today" value={data.logsToday} />
            <Metric
              label="Last result"
              value={data.lastVerification ? (data.lastVerification.allowed ? "Allowed" : "Denied") : "None"}
            />
          </section>
          <section>
            <SectionTitle title="Last verification" />
            {data.lastVerification ? <LogList logs={[data.lastVerification]} /> : <div className="console-empty">No verification logs yet.</div>}
          </section>
        </>
      )}
    </ResourceState>
  );
}

function AgentsView() {
  const agents = useApiResource<AgentsResponse>("/api/console/agents");
  const [name, setName] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiFetch<{ agent: Agent; apiKey: string }>("/api/console/agents", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setOneTimeKey(result.apiKey);
      setName("");
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
              <SectionTitle title="Create agent" />
              <label>
                <span>Name</span>
                <input onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              <button className="console-primary-button" disabled={submitting} type="submit">
                {submitting ? "Creating" : "Create agent"}
              </button>
              {oneTimeKey ? <SecretBox label="New API key" value={oneTimeKey} /> : null}
            </form>
          </section>
        </>
      )}
    </ResourceState>
  );
}

function AgentDetailView({ agentId }: { agentId: string }) {
  const detail = useApiResource<AgentDetail>(`/api/console/agents/${agentId}`);
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [form, setForm] = useState({
    action: "purchase",
    maxAmount: "800",
    allowedVendors: "coachella.com",
    expiresAt: tomorrowIsoLocal(),
    description: ""
  });

  const reload = detail.reload;

  const rotateKey = async () => {
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
        constraints: {
          maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
          allowedVendors: form.allowedVendors
            ? form.allowedVendors.split(",").map((vendor) => vendor.trim()).filter(Boolean)
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
                <button className="console-ghost-button" onClick={rotateKey} type="button">
                  Rotate key
                </button>
                {data.agent.status === "disabled" ? (
                  <button className="console-primary-button" onClick={() => setStatus("enable")} type="button">
                    Enable
                  </button>
                ) : (
                  <button className="console-danger-button" onClick={() => setStatus("disable")} type="button">
                    Disable
                  </button>
                )}
              </div>
            }
          />
          <section className="console-detail">
            <div className="console-panel">
              <SectionTitle title="Agent" />
              <dl className="console-definition">
                <div><dt>Agent ID</dt><dd>{data.agent.agentId}</dd></div>
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
              <label><span>Action</span><input onChange={(event) => setForm({ ...form, action: event.target.value })} required value={form.action} /></label>
              <label><span>Max amount</span><input min="0" onChange={(event) => setForm({ ...form, maxAmount: event.target.value })} type="number" value={form.maxAmount} /></label>
              <label><span>Allowed vendors</span><input onChange={(event) => setForm({ ...form, allowedVendors: event.target.value })} value={form.allowedVendors} /></label>
              <label><span>Expires at</span><input onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} type="datetime-local" value={form.expiresAt} /></label>
              <label><span>Description</span><textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} value={form.description} /></label>
              <button className="console-primary-button" type="submit">Create permission</button>
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
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    if (allowed) params.set("allowed", allowed);
    return `/api/console/logs${params.size ? `?${params.toString()}` : ""}`;
  }, [agentId, allowed]);
  const logs = useApiResource<LogsResponse>(path);

  return (
    <>
      <Header title="Logs" />
      <div className="console-toolbar">
        <input aria-label="Filter by agent ID" onChange={(event) => setAgentId(event.target.value)} placeholder="agent_xxx" value={agentId} />
        <select aria-label="Allowed filter" onChange={(event) => setAllowed(event.target.value)} value={allowed}>
          <option value="">All decisions</option>
          <option value="true">Allowed</option>
          <option value="false">Denied</option>
        </select>
        <button className="console-ghost-button" onClick={logs.reload} type="button">Refresh</button>
      </div>
      <ResourceState resource={logs}>
        {(data) => <LogList logs={data.logs} />}
      </ResourceState>
    </>
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
              <div><dt>MongoDB</dt><dd>{data.mongoStatus}</dd></div>
              <div><dt>Rate limiting</dt><dd>{data.rateLimiting}</dd></div>
            </dl>
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
  return (
    <header className="console-header">
      <div>
        <p className="console-kicker">Console</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="console-section-title">{title}</h2>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="console-metric">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </div>
  );
}

function AgentTable({ agents }: { agents: Agent[] }) {
  if (!agents.length) return <div className="console-empty">No agents found.</div>;
  return (
    <div className="console-table">
      {agents.map((agent) => (
        <Link className="console-row" href={`/console/agents/${agent.agentId}`} key={agent.agentId}>
          <span>
            <strong>{agent.name}</strong>
            <small>{agent.agentId}</small>
          </span>
          <span className={statusClass(agent.status)}>{agent.status}</span>
          <span>{formatDate(agent.updatedAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function PermissionList({ items, onRevoke }: { items: Permission[]; onRevoke: (id: string) => void }) {
  if (!items.length) return <div className="console-empty">No permissions created.</div>;
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
            <button className="console-danger-button" onClick={() => onRevoke(item.permissionId)} type="button">
              Revoke
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LogList({ logs, compact = false }: { logs: VerificationLog[]; compact?: boolean }) {
  if (!logs.length) return <div className="console-empty">No logs found.</div>;
  return (
    <div className={compact ? "console-list console-list--compact" : "console-list"}>
      {logs.map((log) => (
        <div className="console-list__item" key={log.requestId}>
          <span>
            <strong>{log.action}</strong>
            <small>{log.agentId} / {log.vendor || "no vendor"} / {log.reason}</small>
          </span>
          <span className={statusClass(log.allowed ? "allowed" : "denied")}>
            {log.allowed ? "allowed" : "denied"}
          </span>
          <span>{formatDate(log.createdAt)}</span>
        </div>
      ))}
    </div>
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
      <button className="console-ghost-button" onClick={copy} type="button">
        {copied ? "Copied" : "Copy key"}
      </button>
    </div>
  );
}

function permissionSummary(permission: Permission) {
  const constraints = permission.constraints ?? {};
  const parts = [
    typeof constraints.maxAmount === "number" ? `max $${constraints.maxAmount}` : null,
    constraints.allowedVendors?.length ? constraints.allowedVendors.join(", ") : null,
    constraints.expiresAt ? `expires ${formatDate(constraints.expiresAt)}` : null
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : permission.description || permission.permissionId;
}
