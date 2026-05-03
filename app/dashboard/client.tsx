"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, ButtonLink, Card, CodeBlock, EmptyState, PageHeader, StatCard } from "@/components/ui";

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
  publicPassportTokenPreview?: string | null;
  publicPassportEnabled?: boolean;
};
type Permission = { permissionId: string; action: string; status: string; constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: string } };
type Log = { requestId: string; agentId: string; action: string; allowed: boolean; reason: string; risk: string; createdAt?: string };
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; error?: string; attempt: number; maxAttempts?: number; createdAt?: string };
type AgentProvider = "custom" | "ollie" | "chatgpt" | "claude" | "zapier" | "make" | "langchain" | "openai" | "other";
type OnboardingMode = "existing" | "custom";
type VerifyResult = { requestId: string; allowed: boolean; reason: string; risk: string };

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

export function DashboardShell({ view, id }: { view: "home" | "onboarding" | "agents" | "agent" | "webhooks" | "webhook" | "logs" | "docs" | "settings"; id?: string }) {
  return (
    <DashboardShellLayout>
        {view === "home" ? <HomeView /> : null}
        {view === "onboarding" ? <OnboardingView /> : null}
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
  const hasAgents = (summary.data?.totalAgents ?? 0) > 0;
  return (
    <>
      <Header title="Dashboard" action={<ButtonLink variant="primary" href="/dashboard/onboarding">Add agent</ButtonLink>} />
      {summary.error ? <p className="form-error">{summary.error}</p> : null}
      {!hasAgents ? (
        <Card className="dashboard-panel onboarding-callout">
          <p className="section-kicker">Start here</p>
          <h2>Connect an agent, create permissions, then test an action.</h2>
          <p>Manual mode helps you test the permission model. Developer integration is required for automatic enforcement.</p>
          <ButtonLink variant="primary" href="/dashboard/onboarding">Start onboarding</ButtonLink>
        </Card>
      ) : null}
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
  const agents = resource.data?.agents ?? [];
  return (
    <>
      <Header title="Agents" action={<ButtonLink variant="primary" href="/dashboard/onboarding">Add agent</ButtonLink>} />
      {!agents.length ? (
        <Card className="dashboard-panel onboarding-callout">
          <h2>Add an agent to create its permission passport.</h2>
          <p>Start with an existing assistant in manual test mode, or create a native agent for API enforcement.</p>
          <ButtonLink variant="primary" href="/dashboard/onboarding">Start onboarding</ButtonLink>
        </Card>
      ) : null}
      <Rows items={agents} href={(agent) => `/dashboard/agents/${agent.agentId}`} title={(agent) => agent.name} meta={(agent) => `${agent.agentType} / ${agent.provider} / ${agent.status}`} />
    </>
  );
}

function OnboardingView() {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<OnboardingMode | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [permissionId, setPermissionId] = useState("");
  const [decision, setDecision] = useState<VerifyResult | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: "Ollie",
    provider: "ollie" as AgentProvider,
    externalAgentLabel: "",
    description: "Personal assistant used for planning"
  });
  const [permissionForm, setPermissionForm] = useState({
    actionChoice: "purchase",
    customAction: "",
    vendor: "coachella.com",
    maxAmount: "800",
    expiration: "2"
  });
  const [testForm, setTestForm] = useState({ action: "purchase", vendor: "coachella.com", amount: "742" });

  const selectedAction = permissionForm.actionChoice === "custom" ? permissionForm.customAction : permissionForm.actionChoice;

  const createAgent = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
      method: "POST",
      body: JSON.stringify(mode === "existing" ? {
        name: agentForm.name,
        agentType: "connected",
        provider: agentForm.provider,
        externalAgentLabel: agentForm.externalAgentLabel || undefined,
        description: agentForm.description || undefined
      } : {
        name: agentForm.name || "Custom agent",
        agentType: "native",
        provider: "custom",
        description: agentForm.description || undefined
      })
    });
    setAgent(result.agent);
    setApiKey(result.apiKey);
    const passport = await api<{ passportUrl: string }>(`/api/dashboard/agents/${result.agent.agentId}/passport`, { method: "POST" });
    setPassportUrl(passport.passportUrl);
    setStep(3);
  };

  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    if (!agent) return;
    const result = await api<{ permissionId: string }>(`/api/dashboard/agents/${agent.agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: selectedAction,
        constraints: {
          maxAmount: permissionForm.maxAmount ? Number(permissionForm.maxAmount) : undefined,
          allowedVendors: permissionForm.vendor ? [permissionForm.vendor] : undefined,
          expiresAt: new Date(Date.now() + Number(permissionForm.expiration || "2") * 60 * 60 * 1000).toISOString()
        }
      })
    });
    setPermissionId(result.permissionId);
    setTestForm({ action: selectedAction, vendor: permissionForm.vendor, amount: permissionForm.maxAmount ? String(Math.min(Number(permissionForm.maxAmount), 742)) : "" });
    setStep(4);
  };

  const testAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!agent) return;
    setDecision(await api<VerifyResult>("/api/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        agentId: agent.agentId,
        action: testForm.action,
        vendor: testForm.vendor || undefined,
        amount: testForm.amount ? Number(testForm.amount) : undefined
      })
    }));
    setStep(5);
  };

  const instructions = `You are connected to my BehalfID permission passport.

Before taking actions involving purchases, scheduling, sending messages, or external services, ask me to verify the action through BehalfID.

Permission passport:
${passportUrl || "[passport link]"}

If BehalfID denies the action, do not proceed.`;

  return (
    <>
      <Header title="Add agent" />
      <Card className="dashboard-panel onboarding-callout">
        <p className="section-kicker">Connect an agent / create permissions / test an action / choose how to use it</p>
        <h2>Manual mode helps you test the permission model. Developer integration is required for automatic enforcement.</h2>
      </Card>
      <div className="onboarding-steps">
        {[1, 2, 3, 4, 5].map((item) => <span className={item === step ? "console-status console-status--active" : "console-status"} key={item}>Step {item}</span>)}
      </div>
      {step === 1 ? (
        <section className="agent-create-grid">
          <button className="dashboard-panel onboarding-choice" onClick={() => { setMode("existing"); setAgentForm({ name: "Ollie", provider: "ollie", externalAgentLabel: "", description: "Personal assistant used for planning" }); setStep(2); }} type="button">
            <span className="console-status console-status--active">Manual test mode</span>
            <h2>I use an existing agent</h2>
            <p>Create a permission passport for Ollie, ChatGPT, Claude, Zapier, Make, or another assistant you already use.</p>
            <small>Works today in manual test mode. Provider-native integrations can be added later.</small>
          </button>
          <button className="dashboard-panel onboarding-choice" onClick={() => { setMode("custom"); setAgentForm({ name: "Jasper Shopping Agent", provider: "custom", externalAgentLabel: "", description: "Custom checkout agent for ticket purchasing" }); setStep(2); }} type="button">
            <span className="console-status">Developer integration mode</span>
            <h2>I’m building my own agent</h2>
            <p>Create a BehalfID-native agent for API or SDK integration.</p>
            <small>Best for apps that can call BehalfID before actions happen.</small>
          </button>
        </section>
      ) : null}
      {step === 2 ? (
        <form className="dashboard-panel onboarding-form" onSubmit={createAgent}>
          <h2>{mode === "existing" ? "Existing agent setup" : "Custom agent setup"}</h2>
          <p>{mode === "existing" ? "This creates a manual permission passport for an agent you already use." : "This creates a native BehalfID agent with an API key for SDK/API enforcement."}</p>
          <label><span>Agent name</span><input value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} required /></label>
          {mode === "existing" ? (
            <>
              <label><span>Provider</span><select value={agentForm.provider} onChange={(event) => setAgentForm({ ...agentForm, provider: event.target.value as AgentProvider })}>{providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
              <label><span>External label / handle / ID</span><input value={agentForm.externalAgentLabel} onChange={(event) => setAgentForm({ ...agentForm, externalAgentLabel: event.target.value })} /></label>
            </>
          ) : null}
          <label><span>Description</span><textarea rows={3} value={agentForm.description} onChange={(event) => setAgentForm({ ...agentForm, description: event.target.value })} /></label>
          <Button variant="primary" type="submit">Create passport</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="dashboard-panel onboarding-form" onSubmit={createPermission}>
          <h2>Create first permission</h2>
          <label><span>Action</span><select value={permissionForm.actionChoice} onChange={(event) => setPermissionForm({ ...permissionForm, actionChoice: event.target.value })}><option value="purchase">purchase</option><option value="schedule">schedule</option><option value="send_message">send_message</option><option value="access_data">access_data</option><option value="custom">custom</option></select></label>
          {permissionForm.actionChoice === "custom" ? <label><span>Custom action</span><input value={permissionForm.customAction} onChange={(event) => setPermissionForm({ ...permissionForm, customAction: event.target.value })} required /></label> : null}
          <label><span>Vendor / service / workflow</span><input value={permissionForm.vendor} onChange={(event) => setPermissionForm({ ...permissionForm, vendor: event.target.value })} /></label>
          <label><span>Max amount</span><input min="0" type="number" value={permissionForm.maxAmount} onChange={(event) => setPermissionForm({ ...permissionForm, maxAmount: event.target.value })} /></label>
          <label><span>Expiration</span><select value={permissionForm.expiration} onChange={(event) => setPermissionForm({ ...permissionForm, expiration: event.target.value })}><option value="1">1 hour</option><option value="2">2 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label>
          <Button variant="primary" type="submit">Create permission</Button>
        </form>
      ) : null}
      {step === 4 ? (
        <form className="dashboard-panel onboarding-form" onSubmit={testAction}>
          <h2>Test an action</h2>
          <p>Permission created: <code>{permissionId}</code></p>
          <label><span>Action</span><input value={testForm.action} onChange={(event) => setTestForm({ ...testForm, action: event.target.value })} /></label>
          <label><span>Vendor</span><input value={testForm.vendor} onChange={(event) => setTestForm({ ...testForm, vendor: event.target.value })} /></label>
          <label><span>Amount</span><input min="0" type="number" value={testForm.amount} onChange={(event) => setTestForm({ ...testForm, amount: event.target.value })} /></label>
          <Button variant="primary" type="submit">Test verification</Button>
        </form>
      ) : null}
      {step === 5 && agent ? (
        <section className="onboarding-result-grid">
          <Card className="dashboard-panel">
            <h2>{decision?.allowed ? "Allowed" : "Denied"}</h2>
            <p>{decision?.reason}</p>
            <div className="agent-passport__header"><ButtonLink href={`/dashboard/agents/${agent.agentId}`}>Open agent</ButtonLink>{passportUrl ? <ButtonLink href={passportUrl}>Open passport</ButtonLink> : null}</div>
          </Card>
          <Card className="dashboard-panel">
            <h2>Manual test mode</h2>
            <p>This does not automatically control the external agent. It is a manual test workflow until the provider or your app integrates BehalfID.</p>
            <CodeBlock label="copy into your agent">{instructions}</CodeBlock>
          </Card>
          <Card className="dashboard-panel">
            <h2>Developer integration</h2>
            <p>The API key was shown once during setup. Store it as <code>BEHALFID_API_KEY</code> and call verify before actions happen.</p>
            <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "${agent.agentId}",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</CodeBlock>
            <div className="agent-passport__header"><ButtonLink href="/docs/quickstart">Quickstart</ButtonLink><ButtonLink href="/docs/sdk">SDK docs</ButtonLink></div>
          </Card>
        </section>
      ) : null}
      {apiKey && step < 5 ? <Secret value={apiKey} label="Agent API key" /> : null}
    </>
  );
}

function AgentView({ agentId }: { agentId: string }) {
  const detail = useResource<{ agent: Agent; permissions: Permission[]; logs: Log[] }>(`/api/dashboard/agents/${agentId}`);
  const [secret, setSecret] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [form, setForm] = useState({ action: "purchase", maxAmount: "800", vendors: "coachella.com", expiresAt: "" });
  const [profile, setProfile] = useState<Partial<Pick<Agent, "name" | "provider" | "externalAgentId" | "externalAgentLabel" | "description" | "connectionStatus">>>({});
  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    await api(`/api/dashboard/agents/${agentId}/permissions`, { method: "POST", body: JSON.stringify({ action: form.action, constraints: { maxAmount: Number(form.maxAmount), allowedVendors: form.vendors.split(",").map((v) => v.trim()).filter(Boolean), expiresAt: form.expiresAt || undefined } }) });
    await detail.reload();
  };
  const rotate = async () => setSecret((await api<{ apiKey: string }>(`/api/dashboard/agents/${agentId}/rotate-key`, { method: "POST" })).apiKey);
  const regeneratePassport = async () => {
    const result = await api<{ passportUrl: string }>(`/api/dashboard/agents/${agentId}/passport`, { method: "POST" });
    setPassportUrl(result.passportUrl);
    await detail.reload();
  };
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
      {agent ? (
        <section className={agent.agentType === "connected" ? "onboarding-result-grid" : "onboarding-result-grid onboarding-result-grid--native"}>
          <Card className="dashboard-panel">
            <h2>{agent.agentType === "connected" ? "Manual test mode" : "Developer integration"}</h2>
            <p>{agent.agentType === "connected" ? "Create a public-safe passport link and copy instructions into the external agent. Automatic enforcement requires provider or app integration." : "Use this API key directly from your custom integration and call verify before actions happen."}</p>
            <Button onClick={regeneratePassport} type="button">{agent.publicPassportEnabled ? "Regenerate passport link" : "Create passport link"}</Button>
            {passportUrl ? <Secret value={passportUrl} label="Passport link" /> : null}
            {agent.publicPassportTokenPreview ? <p>Current passport token: <code>{agent.publicPassportTokenPreview}</code></p> : null}
          </Card>
          <Card className="dashboard-panel">
            <h2>{agent.agentType === "connected" ? "Developer integration" : "Manual testing"}</h2>
            <p>{agent.agentType === "connected" ? "When your app or provider can call BehalfID, use the SDK/API for automatic enforcement." : "Native agents can also use a passport link for manual allow/deny testing."}</p>
            <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "${agent.agentId}",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</CodeBlock>
          </Card>
        </section>
      ) : null}
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
