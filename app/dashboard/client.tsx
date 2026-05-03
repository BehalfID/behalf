"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

type Agent = {
  agentId: string;
  name: string;
  status: string;
  agentType: "native" | "connected";
  provider: AgentProvider;
  connectionStatus: "manual" | "connected" | "disconnected";
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
};
type Permission = { permissionId: string; action: string; status: string; constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: string } };
type Log = { requestId: string; agentId: string; action: string; allowed: boolean; reason: string; risk: string; createdAt?: string };
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; error?: string; attempt: number; maxAttempts?: number; createdAt?: string };
type AgentProvider = "custom" | "ollie" | "chatgpt" | "claude" | "zapier" | "make" | "langchain" | "openai" | "other";

const providerOptions: Array<{ value: AgentProvider; label: string }> = [
  { value: "ollie", label: "Ollie" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "zapier", label: "Zapier" },
  { value: "make", label: "Make" },
  { value: "langchain", label: "LangChain" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
  { value: "other", label: "Other" }
];

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
        <ol><li>Add a native or connected agent</li><li>Create a permission passport</li><li>Install <code>@behalfid/sdk</code></li><li>Verify before the agent acts</li></ol>
      </Card>
    </>
  );
}

function AgentsView() {
  const resource = useResource<{ agents: Agent[] }>("/api/dashboard/agents");
  const [native, setNative] = useState({ name: "", description: "" });
  const [connected, setConnected] = useState({
    name: "Ollie",
    provider: "ollie" as AgentProvider,
    externalAgentLabel: "",
    description: "Personal assistant used for planning"
  });
  const [apiKey, setApiKey] = useState("");
  const createNative = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
      method: "POST",
      body: JSON.stringify({
        name: native.name,
        agentType: "native",
        provider: "custom",
        description: native.description || undefined
      })
    });
    setApiKey(result.apiKey);
    setNative({ name: "", description: "" });
    await resource.reload();
  };
  const createConnected = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
      method: "POST",
      body: JSON.stringify({
        name: connected.name,
        agentType: "connected",
        provider: connected.provider,
        externalAgentLabel: connected.externalAgentLabel || undefined,
        description: connected.description || undefined
      })
    });
    setApiKey(result.apiKey);
    setConnected({ name: "", provider: "ollie", externalAgentLabel: "", description: "" });
    await resource.reload();
  };
  return (
    <>
      <Header title="Agents" />
      <div className="agent-create-grid">
      <form className="dashboard-panel agent-create-card" onSubmit={createNative}>
        <span className="console-status">Native</span>
        <h2>Native agent</h2>
        <p>Create a BehalfID-native agent for custom API or SDK integrations.</p>
        <label>
          <span>Agent name</span>
          <input onChange={(event) => setNative({ ...native, name: event.target.value })} placeholder="Jasper Shopping Agent" required value={native.name} />
        </label>
        <label>
          <span>Description</span>
          <textarea onChange={(event) => setNative({ ...native, description: event.target.value })} placeholder="Custom checkout agent for ticket purchasing" rows={3} value={native.description} />
        </label>
        <Button variant="primary" type="submit">Add native agent</Button>
      </form>
      <form className="dashboard-panel agent-create-card" onSubmit={createConnected}>
        <span className="console-status console-status--active">Connected</span>
        <h2>Connected agent</h2>
        <p>Represent an AI agent you already use, then manage its permission passport in BehalfID.</p>
        <label>
          <span>Agent name</span>
          <input onChange={(event) => setConnected({ ...connected, name: event.target.value })} placeholder="Ollie" required value={connected.name} />
        </label>
        <label>
          <span>Provider</span>
          <select onChange={(event) => setConnected({ ...connected, provider: event.target.value as AgentProvider })} value={connected.provider}>
            {providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
        </label>
        <label>
          <span>External agent ID / handle / label</span>
          <input onChange={(event) => setConnected({ ...connected, externalAgentLabel: event.target.value })} placeholder="Jasper's Ollie assistant" value={connected.externalAgentLabel} />
        </label>
        <label>
          <span>Description</span>
          <textarea onChange={(event) => setConnected({ ...connected, description: event.target.value })} rows={3} value={connected.description} />
        </label>
        <Button variant="primary" type="submit">Connect agent</Button>
      </form>
      </div>
      {apiKey ? <Secret value={apiKey} label="Agent API key" /> : null}
      <Rows items={resource.data?.agents ?? []} href={(agent) => `/dashboard/agents/${agent.agentId}`} title={(agent) => agent.name} meta={(agent) => `${agent.agentType} / ${agent.provider} / ${agent.status}`} />
    </>
  );
}

function AgentView({ agentId }: { agentId: string }) {
  const detail = useResource<{ agent: Agent; permissions: Permission[]; logs: Log[] }>(`/api/dashboard/agents/${agentId}`);
  const [secret, setSecret] = useState("");
  const [form, setForm] = useState({ action: "purchase", maxAmount: "800", vendors: "coachella.com", expiresAt: "" });
  const [profile, setProfile] = useState<Partial<Pick<Agent, "name" | "provider" | "externalAgentId" | "externalAgentLabel" | "description" | "connectionStatus">>>({});
  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    await api(`/api/dashboard/agents/${agentId}/permissions`, { method: "POST", body: JSON.stringify({ action: form.action, constraints: { maxAmount: Number(form.maxAmount), allowedVendors: form.vendors.split(",").map((v) => v.trim()).filter(Boolean), expiresAt: form.expiresAt || undefined } }) });
    await detail.reload();
  };
  const rotate = async () => setSecret((await api<{ apiKey: string }>(`/api/dashboard/agents/${agentId}/rotate-key`, { method: "POST" })).apiKey);
  const setStatus = async (status: "enable" | "disable") => { await api(`/api/dashboard/agents/${agentId}/${status}`, { method: "POST" }); await detail.reload(); };
  const revoke = async (permissionId: string) => { await api(`/api/dashboard/agents/${agentId}/permissions/${permissionId}/revoke`, { method: "POST" }); await detail.reload(); };
  const updateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail.data?.agent) return;
    const current = detail.data.agent;
    await api(`/api/dashboard/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: profile.name ?? current.name,
        provider: profile.provider ?? current.provider,
        externalAgentId: profile.externalAgentId ?? current.externalAgentId ?? undefined,
        externalAgentLabel: profile.externalAgentLabel ?? current.externalAgentLabel ?? undefined,
        description: profile.description ?? current.description ?? undefined,
        connectionStatus: profile.connectionStatus ?? current.connectionStatus
      })
    });
    setProfile({});
    await detail.reload();
  };
  const agent = detail.data?.agent;
  return (
    <>
      <Header title={agent?.name ?? "Agent"} action={<Button onClick={rotate}>Rotate key</Button>} />
      {secret ? <Secret value={secret} label="Rotated API key" /> : null}
      <div className="dashboard-actions"><Button onClick={() => setStatus("disable")}>Disable</Button><Button onClick={() => setStatus("enable")}>Enable</Button></div>
      {agent ? (
        <Card className="dashboard-panel agent-passport">
          <div className="agent-passport__header">
            <span className="console-status console-status--active">{agent.agentType === "connected" ? "Connected" : "Native"}</span>
            <span className="console-status">{agent.provider}</span>
            <span className="console-status">{agent.connectionStatus}</span>
          </div>
          <p>{agent.agentType === "native" ? "Use this API key directly from your custom integration." : "Use this BehalfID credential to represent this external agent when your app verifies actions."}</p>
          {agent.agentType === "connected" ? <p>Connected agents are manually represented today. Provider-native integrations are planned.</p> : null}
          <dl className="console-definition">
            <div><dt>Agent ID</dt><dd>{agent.agentId}</dd></div>
            <div><dt>External label</dt><dd>{agent.externalAgentLabel || "Not set"}</dd></div>
            <div><dt>External ID</dt><dd>{agent.externalAgentId || "Not set"}</dd></div>
            <div><dt>Description</dt><dd>{agent.description || "Not set"}</dd></div>
          </dl>
        </Card>
      ) : null}
      <form className="dashboard-panel form-grid agent-edit-form" onSubmit={updateProfile}>
        <label><span>Name</span><input value={profile.name ?? agent?.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label><span>Provider</span><select value={profile.provider ?? agent?.provider ?? "custom"} onChange={(e) => setProfile({ ...profile, provider: e.target.value as AgentProvider })}>{providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
        <label><span>Connection status</span><select value={profile.connectionStatus ?? agent?.connectionStatus ?? "manual"} onChange={(e) => setProfile({ ...profile, connectionStatus: e.target.value as Agent["connectionStatus"] })}><option value="manual">Manual</option><option value="connected">Connected</option><option value="disconnected">Disconnected</option></select></label>
        <label><span>External label</span><input value={profile.externalAgentLabel ?? agent?.externalAgentLabel ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentLabel: e.target.value })} /></label>
        <label><span>External ID</span><input value={profile.externalAgentId ?? agent?.externalAgentId ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentId: e.target.value })} /></label>
        <label><span>Description</span><input value={profile.description ?? agent?.description ?? ""} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></label>
        <Button variant="primary" type="submit">Save profile</Button>
      </form>
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
