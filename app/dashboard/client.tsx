"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

type Agent = { agentId: string; name: string; status: string; createdAt?: string; updatedAt?: string };
type Permission = { permissionId: string; action: string; status: string; constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: string } };
type Log = { requestId: string; agentId: string; action: string; allowed: boolean; reason: string; risk: string; createdAt?: string };
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; error?: string; attempt: number; maxAttempts?: number; createdAt?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setError("");
      setData(await api<T>(path));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    }
  }, [path]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const result = await api<T>(path);
        if (!cancelled) setData(result);
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Request failed.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { data, error, reload };
}

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Never";
}

export function DashboardShell({ view, id }: { view: "home" | "agents" | "agent" | "webhooks" | "webhook" | "logs" | "docs" | "settings"; id?: string }) {
  return (
    <DashboardShellLayout>
        {view === "home" ? <HomeView /> : null}
        {view === "agents" ? <AgentsView /> : null}
        {view === "agent" && id ? <AgentView agentId={id} /> : null}
        {view === "webhooks" ? <WebhooksView /> : null}
        {view === "webhook" && id ? <WebhookView webhookId={id} /> : null}
        {view === "logs" ? <LogsView /> : null}
        {view === "docs" ? <DashboardDocs /> : null}
        {view === "settings" ? <SettingsView /> : null}
    </DashboardShellLayout>
  );
}

function HomeView() {
  const summary = useResource<{ totalAgents: number; activePermissions: number; logsToday: number; pendingEvents: number; failedEvents: number }>("/api/dashboard/summary");
  return (
    <>
      <Header title="Dashboard" />
      {summary.error ? <p className="form-error">{summary.error}</p> : null}
      <div className="metric-grid">
        <Metric label="Agents" value={summary.data?.totalAgents ?? 0} />
        <Metric label="Active permissions" value={summary.data?.activePermissions ?? 0} />
        <Metric label="Logs today" value={summary.data?.logsToday ?? 0} />
        <Metric label="Webhook issues" value={summary.data?.failedEvents ?? 0} />
      </div>
      <Card className="dashboard-panel">
        <h2>Quickstart</h2>
        <ol><li>Create an agent</li><li>Create a permission</li><li>Install <code>@behalfid/sdk</code></li><li>Verify before the agent acts</li></ol>
      </Card>
    </>
  );
}

function AgentsView() {
  const resource = useResource<{ agents: Agent[] }>("/api/dashboard/agents");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", { method: "POST", body: JSON.stringify({ name }) });
    setApiKey(result.apiKey);
    setName("");
    await resource.reload();
  };
  return (
    <>
      <Header title="Agents" />
      <form className="dashboard-panel inline-form" onSubmit={create}>
        <label>
          <span>Agent name</span>
          <input onChange={(event) => setName(event.target.value)} placeholder="Jasper Shopping Agent" required value={name} />
        </label>
        <Button variant="primary" type="submit">Create agent</Button>
      </form>
      {apiKey ? <Secret value={apiKey} label="Agent API key" /> : null}
      <Rows items={resource.data?.agents ?? []} href={(agent) => `/dashboard/agents/${agent.agentId}`} title={(agent) => agent.name} meta={(agent) => `${agent.agentId} / ${agent.status}`} />
    </>
  );
}

function AgentView({ agentId }: { agentId: string }) {
  const detail = useResource<{ agent: Agent; permissions: Permission[]; logs: Log[] }>(`/api/dashboard/agents/${agentId}`);
  const [secret, setSecret] = useState("");
  const [form, setForm] = useState({ action: "purchase", maxAmount: "800", vendors: "coachella.com", expiresAt: "" });
  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    await api(`/api/dashboard/agents/${agentId}/permissions`, { method: "POST", body: JSON.stringify({ action: form.action, constraints: { maxAmount: Number(form.maxAmount), allowedVendors: form.vendors.split(",").map((v) => v.trim()).filter(Boolean), expiresAt: form.expiresAt || undefined } }) });
    await detail.reload();
  };
  const rotate = async () => setSecret((await api<{ apiKey: string }>(`/api/dashboard/agents/${agentId}/rotate-key`, { method: "POST" })).apiKey);
  const setStatus = async (status: "enable" | "disable") => { await api(`/api/dashboard/agents/${agentId}/${status}`, { method: "POST" }); await detail.reload(); };
  const revoke = async (permissionId: string) => { await api(`/api/dashboard/agents/${agentId}/permissions/${permissionId}/revoke`, { method: "POST" }); await detail.reload(); };
  return (
    <>
      <Header title={detail.data?.agent.name ?? "Agent"} action={<Button onClick={rotate}>Rotate key</Button>} />
      {secret ? <Secret value={secret} label="Rotated API key" /> : null}
      <div className="dashboard-actions"><Button onClick={() => setStatus("disable")}>Disable</Button><Button onClick={() => setStatus("enable")}>Enable</Button></div>
      <form className="dashboard-panel form-grid" onSubmit={createPermission}>
        <label>
          <span>Action</span>
          <input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} />
        </label>
        <label>
          <span>Max amount</span>
          <input value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
        </label>
        <label>
          <span>Allowed vendors</span>
          <input value={form.vendors} onChange={(e) => setForm({ ...form, vendors: e.target.value })} />
        </label>
        <label>
          <span>Expires at</span>
          <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <Button variant="primary" type="submit">Create permission</Button>
      </form>
      <h2>Permissions</h2>
      <div className="dashboard-list">{(detail.data?.permissions ?? []).map((p) => <div key={p.permissionId}><span><strong>{p.action}</strong><small>{p.permissionId} / {p.status}</small></span><Badge>{p.status}</Badge>{p.status === "active" ? <Button onClick={() => revoke(p.permissionId)}>Revoke</Button> : null}</div>)}</div>
      <h2>Recent logs</h2>
      <LogList logs={detail.data?.logs ?? []} />
    </>
  );
}

function WebhooksView() {
  const resource = useResource<{ webhooks: Webhook[]; eventTypes: string[] }>("/api/dashboard/webhooks");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const events = useMemo(() => ["verification.allowed", "verification.denied", "agent.key_rotated", "permission.revoked"], []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ secret: string }>("/api/dashboard/webhooks", { method: "POST", body: JSON.stringify({ url, events }) });
    setSecret(result.secret);
    setUrl("");
    await resource.reload();
  };
  return (
    <>
      <Header title="Webhooks" />
      <form className="dashboard-panel inline-form" onSubmit={create}>
        <label>
          <span>Endpoint URL</span>
          <input onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/behalfid" required value={url} />
        </label>
        <Button variant="primary">Create webhook</Button>
      </form>
      {secret ? <Secret value={secret} label="Signing secret" /> : null}
      <Rows items={resource.data?.webhooks ?? []} href={(w) => `/dashboard/webhooks/${w.webhookId}`} title={(w) => w.url} meta={(w) => `${w.status} / ${w.events.join(", ")}`} />
    </>
  );
}

function WebhookView({ webhookId }: { webhookId: string }) {
  const detail = useResource<{ webhook: Webhook; deliveries: Delivery[] }>(`/api/dashboard/webhooks/${webhookId}`);
  const [secret, setSecret] = useState("");
  const rotate = async () => setSecret((await api<{ secret: string }>(`/api/dashboard/webhooks/${webhookId}/rotate-secret`, { method: "POST" })).secret);
  const setStatus = async (status: "enable" | "disable") => { await api(`/api/dashboard/webhooks/${webhookId}/${status}`, { method: "POST" }); await detail.reload(); };
  return (
    <>
      <Header title="Webhook" action={<Button onClick={rotate}>Rotate secret</Button>} />
      {secret ? <Secret value={secret} label="Rotated signing secret" /> : null}
      <div className="dashboard-actions"><Button onClick={() => setStatus("disable")}>Disable</Button><Button onClick={() => setStatus("enable")}>Enable</Button></div>
      <Card className="dashboard-panel"><strong>{detail.data?.webhook.url}</strong><p>{detail.data?.webhook.secretPreview}</p></Card>
      <div className="dashboard-list">{(detail.data?.deliveries ?? []).map((d) => <div key={d.deliveryId}><span><strong>{d.eventType}</strong><small>{d.eventId} / attempt {d.attempt}{d.error ? ` / ${d.error}` : ""}</small></span><Badge>{d.status}</Badge></div>)}</div>
    </>
  );
}

function LogsView() {
  const logs = useResource<{ logs: Log[] }>("/api/dashboard/logs");
  return <><Header title="Logs" /><LogList logs={logs.data?.logs ?? []} /></>;
}

function SettingsView() {
  const settings = useResource<{ email: string; appUrl: string; apiUsage: string; dangerZone: string }>("/api/dashboard/settings");
  return <><Header title="Settings" /><Card className="dashboard-panel"><p>{settings.data?.email}</p><p>{settings.data?.appUrl}</p><p>{settings.data?.apiUsage}</p><p>{settings.data?.dangerZone}</p></Card></>;
}

function DashboardDocs() {
  return <><Header title="Integration docs" /><Card className="dashboard-panel dashboard-doc-links"><ButtonLink href="/docs/quickstart">Quickstart</ButtonLink><ButtonLink href="/docs/sdk">SDK</ButtonLink><ButtonLink href="/docs/webhooks">Webhooks</ButtonLink></Card></>;
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return <PageHeader eyebrow="Developer portal" title={title} action={action} className="dashboard-header" />;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <StatCard label={label} value={value} />;
}

function Rows<T>({ items, href, title, meta }: { items: T[]; href: (item: T) => string; title: (item: T) => string; meta: (item: T) => string }) {
  if (!items.length) return <EmptyState className="dashboard-empty">Nothing here yet.</EmptyState>;
  return <div className="dashboard-list">{items.map((item) => <Link href={href(item)} key={href(item)}><span><strong>{title(item)}</strong><small>{meta(item)}</small></span></Link>)}</div>;
}

function LogList({ logs }: { logs: Log[] }) {
  if (!logs.length) return <EmptyState className="dashboard-empty">No logs yet.</EmptyState>;
  return <div className="dashboard-list">{logs.map((log) => <div key={log.requestId}><span><strong>{log.action}</strong><small>{log.agentId} / {log.reason}</small></span><Badge>{log.allowed ? "allowed" : "denied"}</Badge><span>{date(log.createdAt)}</span></div>)}</div>;
}

function Secret({ label, value }: { label: string; value: string }) {
  return <div className="secret-panel"><strong>{label}</strong><p>Shown once. Store it now.</p><code>{value}</code></div>;
}
