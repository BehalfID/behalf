"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, ButtonLink, Card, CodeBlock, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { SCOPE_TEMPLATES } from "@/lib/scopeTemplates";

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
type PermissionTemplate = "access_data" | "create_content" | "schedule" | "purchase" | "custom";
type Permission = {
  permissionId: string;
  action: string;
  status: string;
  description?: string;
  resource?: string;
  scope?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
  template?: PermissionTemplate;
  constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: string };
};
type Log = { requestId: string; agentId: string; action: string; allowed: boolean; reason: string; risk: string; createdAt?: string };
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; error?: string; attempt: number; maxAttempts?: number; createdAt?: string };
type AgentProvider = "custom" | "ollie" | "chatgpt" | "claude" | "zapier" | "make" | "langchain" | "openai" | "other";
type ProviderSelection = AgentProvider | "";
type OnboardingMode = "existing" | "custom";
type VerifyResult = { requestId: string; allowed: boolean; reason: string; risk: string };

const permissionTemplates: Array<{ value: PermissionTemplate; title: string; body: string }> = [
  { value: "access_data", title: "Access data", body: "Read from a service or dataset without granting write access." },
  { value: "create_content", title: "Create or send content", body: "Draft, create, or send messages and records with approval controls." },
  { value: "schedule", title: "Schedule or coordinate", body: "Suggest times, create draft events, or book meetings inside a workflow." },
  { value: "purchase", title: "Purchase or transaction", body: "Allow buying or payment-like actions under vendor and amount limits." },
  { value: "custom", title: "Custom permission", body: "Define your own action, resource, and constraints." }
];

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
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingScopeId, setOnboardingScopeId] = useState("");
  const [agentForm, setAgentForm] = useState({
    name: "",
    provider: "" as ProviderSelection,
    externalAgentLabel: "",
    description: ""
  });
  const [permissionForm, setPermissionForm] = useState({
    template: "" as PermissionTemplate | "",
    actionChoice: "",
    customAction: "",
    resource: "",
    scope: "",
    allowedActions: "",
    blockedActions: "",
    requiresApproval: "yes",
    maxAmount: "",
    expiration: "",
    notes: ""
  });
  const [testForm, setTestForm] = useState({ action: "", resource: "", amount: "", context: "" });

  const selectedAction = permissionForm.template === "custom" ? permissionForm.customAction : permissionForm.actionChoice;

  const useExampleValues = () => {
    setOnboardingError("");
    setAgentForm({
      name: "Ollie",
      provider: "ollie",
      externalAgentLabel: "",
      description: "Personal assistant used for planning"
    });
    setPermissionForm({
      template: "purchase",
      actionChoice: "purchase",
      customAction: "",
      resource: "coachella.com",
      scope: "",
      allowedActions: "purchase tickets",
      blockedActions: "purchase from other vendors, exceed amount limit",
      requiresApproval: "yes",
      maxAmount: "800",
      expiration: "2",
      notes: ""
    });
  };

  const resetPermissionForm = () => {
    setPermissionForm({
      template: "",
      actionChoice: "",
      customAction: "",
      resource: "",
      scope: "",
      allowedActions: "",
      blockedActions: "",
      requiresApproval: "yes",
      maxAmount: "",
      expiration: "",
      notes: ""
    });
  };

  const applyOnboardingScopeTemplate = (scopeId: string) => {
    setOnboardingScopeId(scopeId);
    if (!scopeId) { resetPermissionForm(); return; }
    const scope = SCOPE_TEMPLATES.find((t) => t.id === scopeId);
    if (!scope || scope.id === "custom") { resetPermissionForm(); return; }
    const template = actionToPermTemplate(scope.defaultAction);
    setPermissionForm({
      template,
      actionChoice: scope.defaultAction,
      customAction: "",
      resource: scope.exampleResource,
      scope: "",
      allowedActions: scope.defaultAllowedActions.join(", "),
      blockedActions: scope.defaultBlockedActions.join(", "),
      requiresApproval: scope.requiresApprovalDefault ? "yes" : "no",
      maxAmount: "",
      expiration: "",
      notes: ""
    });
  };

  const chooseTemplate = (template: PermissionTemplate) => {
    const defaults: Record<PermissionTemplate, Partial<typeof permissionForm>> = {
      access_data: { actionChoice: "access_data" },
      create_content: { actionChoice: "create_content", requiresApproval: "yes" },
      schedule: { actionChoice: "schedule" },
      purchase: { actionChoice: "purchase" },
      custom: { actionChoice: "custom" }
    };
    setOnboardingError("");
    setPermissionForm({
      template,
      actionChoice: "",
      customAction: "",
      resource: "",
      scope: "",
      allowedActions: "",
      blockedActions: "",
      requiresApproval: "yes",
      maxAmount: "",
      expiration: "",
      notes: "",
      ...defaults[template]
    });
  };

  const createAgent = async (event: FormEvent) => {
    event.preventDefault();
    setOnboardingError("");
    if (!agentForm.name.trim()) {
      setOnboardingError("Agent name is required.");
      return;
    }
    if (mode === "existing" && !agentForm.provider) {
      setOnboardingError("Provider is required for connected agents.");
      return;
    }
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
      method: "POST",
      body: JSON.stringify(mode === "existing" ? {
        name: agentForm.name,
        agentType: "connected",
        provider: agentForm.provider,
        externalAgentLabel: agentForm.externalAgentLabel || undefined,
        description: agentForm.description || undefined
      } : {
        name: agentForm.name,
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
    setOnboardingError("");
    if (!selectedAction.trim()) {
      setOnboardingError("Action is required for permissions.");
      return;
    }
    const result = await api<{ permissionId: string }>(`/api/dashboard/agents/${agent.agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: selectedAction,
        resource: permissionForm.resource || undefined,
        scope: permissionForm.scope || undefined,
        allowedActions: permissionForm.allowedActions
          ? permissionForm.allowedActions.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined,
        blockedActions: permissionForm.blockedActions
          ? permissionForm.blockedActions.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined,
        requiresApproval: permissionForm.requiresApproval === "yes" ? true : permissionForm.requiresApproval === "no" ? false : undefined,
        notes: permissionForm.notes || undefined,
        template: permissionForm.template || undefined,
        constraints: {
          maxAmount: permissionForm.maxAmount ? Number(permissionForm.maxAmount) : undefined,
          allowedVendors: permissionForm.resource ? [permissionForm.resource] : undefined,
          expiresAt: permissionForm.expiration
            ? new Date(Date.now() + Number(permissionForm.expiration) * 60 * 60 * 1000).toISOString()
            : undefined
        }
      })
    });
    setPermissionId(result.permissionId);
    setTestForm({ action: selectedAction, resource: permissionForm.resource, amount: permissionForm.maxAmount || "", context: "" });
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
        resource: testForm.resource || undefined,
        amount: testForm.amount ? Number(testForm.amount) : undefined,
        metadata: testForm.context ? { context: testForm.context } : undefined
      })
    }));
    setStep(5);
  };

  const instructions = `You are connected to my BehalfID permission passport.

Open the passport link and read the Allowed scopes section or Machine-readable passport section before deciding what you are allowed to do.

Before taking an external action, compare the requested action against the allowed scopes in this passport. If the action is not listed, exceeds a limit, is expired, or conflicts with a blocked action, ask me to verify it first.

If BehalfID denies the action, do not proceed.

Permission passport:
${passportUrl || "[passport link]"}`;

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
          <button className="dashboard-panel onboarding-choice" onClick={() => { setMode("existing"); setAgentForm({ name: "", provider: "", externalAgentLabel: "", description: "" }); resetPermissionForm(); setStep(2); }} type="button">
            <span className="console-status console-status--active">Manual test mode</span>
            <h2>I use an existing agent</h2>
            <p>Create a permission passport for Ollie, ChatGPT, Claude, Zapier, Make, or another assistant you already use.</p>
            <small>Works today in manual test mode. Provider-native integrations can be added later.</small>
          </button>
          <button className="dashboard-panel onboarding-choice" onClick={() => { setMode("custom"); setAgentForm({ name: "", provider: "custom", externalAgentLabel: "", description: "" }); resetPermissionForm(); setStep(2); }} type="button">
            <span className="console-status">Developer integration mode</span>
            <h2>I’m building my own agent</h2>
            <p>Create a BehalfID-native agent for API or SDK integration.</p>
            <small>Best for apps that can call BehalfID before actions happen.</small>
          </button>
        </section>
      ) : null}
      {step === 2 ? (
        <form className="dashboard-panel onboarding-form" noValidate onSubmit={createAgent}>
          <h2>{mode === "existing" ? "Existing agent setup" : "Custom agent setup"}</h2>
          <p>{mode === "existing" ? "This creates a manual permission passport for an agent you already use." : "This creates a native BehalfID agent with an API key for SDK/API enforcement."}</p>
          {mode === "existing" ? <Button onClick={useExampleValues} type="button">Use example values</Button> : null}
          <label><span>Agent name</span><input placeholder={mode === "existing" ? "e.g. Ollie, My ChatGPT agent, Finance tutor" : "e.g. Checkout agent, Support workflow agent"} value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} required /></label>
          {mode === "existing" ? (
            <>
              <label><span>Provider</span><select required value={agentForm.provider} onChange={(event) => setAgentForm({ ...agentForm, provider: event.target.value as ProviderSelection })}><option value="">Select provider</option>{providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
              <label>
                <span>External reference (optional)</span>
                <input placeholder="Optional: workspace name, agent URL, handle, or internal label" value={agentForm.externalAgentLabel} onChange={(event) => setAgentForm({ ...agentForm, externalAgentLabel: event.target.value })} />
                <small className="field-help">This can be a handle, workspace name, URL, or any label that helps you identify the external agent. BehalfID does not use this field for authentication. <Link href="/docs/concepts#external-reference">What should I put here?</Link></small>
              </label>
            </>
          ) : null}
          <label><span>Description</span><textarea placeholder={mode === "existing" ? "Optional: what this agent helps you do" : "Optional: what this agent is used for"} rows={3} value={agentForm.description} onChange={(event) => setAgentForm({ ...agentForm, description: event.target.value })} /></label>
          {onboardingError ? <p className="form-error">{onboardingError}</p> : null}
          <Button variant="primary" type="submit">Create passport</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="dashboard-panel onboarding-form" noValidate onSubmit={createPermission}>
          <h2>Create first permission</h2>
          <p>Choose a permission template or define a custom action. Define what an agent can do, what it can access, and what limits apply.</p>
          <Button onClick={useExampleValues} type="button">Use example values</Button>
          <label>
            <span>Scope template</span>
            <select value={onboardingScopeId} onChange={(e) => applyOnboardingScopeTemplate(e.target.value)}>
              <option value="">Select a scope template (optional)</option>
              {SCOPE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <small className="field-help">Scopes are reusable permission patterns. You can edit the allowed and blocked actions before saving.</small>
          </label>
          <div className="permission-template-grid">
            {permissionTemplates.map((template) => (
              <button
                className={permissionForm.template === template.value ? "permission-template permission-template--active" : "permission-template"}
                key={template.value}
                onClick={() => chooseTemplate(template.value)}
                type="button"
              >
                <strong>{template.title}</strong>
                <span>{template.body}</span>
              </button>
            ))}
          </div>
          {permissionForm.template === "access_data" ? (
            <>
              <label><span>Service / resource</span><input placeholder="gmail.com, notion, google-drive, crm" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="read labels, summarize docs, view tickets, provide pricing metrics" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may do.</small></label>
              <label><span>Blocked actions</span><input placeholder="send email, delete files, make purchases, place orders" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent must never do.</small></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "create_content" ? (
            <>
              <label><span>Service / channel</span><input placeholder="gmail.com, slack, hubspot" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="draft replies, create notes, write ticket summaries" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may create or send.</small></label>
              <label><span>Blocked actions</span><input placeholder="send without review, delete messages, modify contacts" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "schedule" ? (
            <>
              <label><span>Calendar / workflow</span><input placeholder="google-calendar, family schedule, sales calendar" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="suggest times, create draft event, book meeting" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may schedule.</small></label>
              <label><span>Blocked actions</span><input placeholder="delete events, invite external contacts, modify recurring events" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Time limit / expiration</span><select value={permissionForm.expiration} onChange={(event) => setPermissionForm({ ...permissionForm, expiration: event.target.value })}><option value="">No expiration</option><option value="1">1 hour</option><option value="2">2 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "purchase" ? (
            <>
              <label><span>Vendor / merchant</span><input placeholder="coachella.com, amazon.com" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Max amount</span><input min="0" placeholder="800" type="number" value={permissionForm.maxAmount} onChange={(event) => setPermissionForm({ ...permissionForm, maxAmount: event.target.value })} /></label>
              <label><span>Expiration</span><select value={permissionForm.expiration} onChange={(event) => setPermissionForm({ ...permissionForm, expiration: event.target.value })}><option value="">No expiration</option><option value="1">1 hour</option><option value="2">2 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "custom" ? (
            <>
              <label><span>Action</span><input placeholder="analyze_statement, create_invoice, update_ticket" value={permissionForm.customAction} onChange={(event) => setPermissionForm({ ...permissionForm, customAction: event.target.value })} /></label>
              <label><span>Resource / service</span><input placeholder="quickbooks invoices, zendesk tickets, student progress" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="read records, summarize, generate report" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may do.</small></label>
              <label><span>Blocked actions</span><input placeholder="edit records, delete, export raw data" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label><span>Notes</span><input placeholder="read-only, max 10 records, internal use only" value={permissionForm.notes} onChange={(event) => setPermissionForm({ ...permissionForm, notes: event.target.value })} /></label>
            </>
          ) : null}
          <p className="field-help">Advanced resource/scope constraints are currently descriptive unless enforced by the integration. BehalfID enforces action, expiration, and simple resource/amount constraints.</p>
          {onboardingError ? <p className="form-error">{onboardingError}</p> : null}
          <Button variant="primary" type="submit">Create permission</Button>
        </form>
      ) : null}
      {step === 4 ? (
        <form className="dashboard-panel onboarding-form" onSubmit={testAction}>
          <h2>Test an action</h2>
          <p>Permission created: <code>{permissionId}</code></p>
          <label><span>Action</span><input value={testForm.action} onChange={(event) => setTestForm({ ...testForm, action: event.target.value })} /></label>
          <label><span>Resource / service</span><input placeholder="gmail.com, slack, google-calendar, coachella.com" value={testForm.resource} onChange={(event) => setTestForm({ ...testForm, resource: event.target.value })} /></label>
          {permissionForm.template === "purchase" ? <label><span>Amount</span><input min="0" type="number" value={testForm.amount} onChange={(event) => setTestForm({ ...testForm, amount: event.target.value })} /></label> : null}
          <label><span>Context / notes</span><input placeholder="Optional context for the preview" value={testForm.context} onChange={(event) => setTestForm({ ...testForm, context: event.target.value })} /></label>
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
            <p>Send this link to your agent so it can read the allowed scopes and ask you to verify actions.</p>
            <p>This does not automatically control the external agent. Developer integration is required for automatic enforcement.</p>
            <p className="field-help">Some agents cannot fetch passport links directly (for example, Gemini memory or ChatGPT system prompts). If the agent cannot read the link, open the passport page and paste the Agent memory block into the agent instead.</p>
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
  action: "access_data",
  vendor: "gmail.com"
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
  const [form, setForm] = useState({
    template: "" as PermissionTemplate | "",
    action: "",
    resource: "",
    allowedActions: "",
    blockedActions: "",
    requiresApproval: false,
    maxAmount: "",
    expiresAt: "",
    scope: ""
  });
  const [agentViewScopeId, setAgentViewScopeId] = useState("");
  const [profile, setProfile] = useState<Partial<Pick<Agent, "name" | "provider" | "externalAgentId" | "externalAgentLabel" | "description" | "connectionStatus">>>({});
  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    const resolvedAction = form.action || form.template || "";
    await api(`/api/dashboard/agents/${agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: resolvedAction,
        resource: form.resource || undefined,
        scope: form.scope || undefined,
        allowedActions: form.allowedActions ? form.allowedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        blockedActions: form.blockedActions ? form.blockedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        requiresApproval: form.requiresApproval || undefined,
        template: form.template || undefined,
        constraints: {
          maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
          allowedVendors: form.resource ? [form.resource] : undefined,
          expiresAt: form.expiresAt || undefined
        }
      })
    });
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
          {agent.agentType === "connected" ? <p>The agent description explains the agent&apos;s purpose. Permissions define what it is actually allowed to do.</p> : null}
          {agent.agentType === "connected" ? <p>Connected agents are manually represented today. Provider-native integrations are planned.</p> : null}
          <dl className="console-definition">
            <div><dt>Agent ID</dt><dd>{agent.agentId}</dd></div>
            <div><dt>External reference</dt><dd>{agent.externalAgentLabel || "Not set"}</dd></div>
            <div><dt>External ID</dt><dd>{agent.externalAgentId || "Not set"}</dd></div>
            <div><dt>Description</dt><dd>{agent.description || "Not set"}</dd></div>
          </dl>
        </Card>
      ) : null}
      <form className="dashboard-panel form-grid agent-edit-form" onSubmit={updateProfile}>
        <label><span>Name</span><input value={profile.name ?? agent?.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label><span>Provider</span><select value={profile.provider ?? agent?.provider ?? "custom"} onChange={(e) => setProfile({ ...profile, provider: e.target.value as AgentProvider })}>{providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
        <label><span>Connection status</span><select value={profile.connectionStatus ?? agent?.connectionStatus ?? "manual"} onChange={(e) => setProfile({ ...profile, connectionStatus: e.target.value as Agent["connectionStatus"] })}><option value="manual">Manual</option><option value="connected">Connected</option><option value="disconnected">Disconnected</option></select></label>
        <label><span>External reference</span><input placeholder="Optional: workspace name, URL, handle, or internal label" value={profile.externalAgentLabel ?? agent?.externalAgentLabel ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentLabel: e.target.value })} /></label>
        <label><span>External ID</span><input value={profile.externalAgentId ?? agent?.externalAgentId ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentId: e.target.value })} /></label>
        <label><span>Description</span><input value={profile.description ?? agent?.description ?? ""} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></label>
        <Button variant="primary" type="submit">Save profile</Button>
      </form>
      {agent ? (
        <section className={agent.agentType === "connected" ? "onboarding-result-grid" : "onboarding-result-grid onboarding-result-grid--native"}>
          <Card className="dashboard-panel">
            <h2>{agent.agentType === "connected" ? "Manual test mode" : "Developer integration"}</h2>
            <p>{agent.agentType === "connected" ? "Send this link to your agent so it can read the allowed scopes and ask you to verify actions. Automatic enforcement requires provider or app integration." : "Use this API key directly from your custom integration and call verify before actions happen."}</p>
            <Button onClick={regeneratePassport} type="button">{agent.publicPassportEnabled ? "Regenerate passport link" : "Create passport link"}</Button>
            {passportUrl ? <Secret value={passportUrl} label="Passport link" /> : null}
            {agent.agentType === "connected" ? <p className="field-help">Treat this passport link like a secret. Anyone with the token can view this agent&apos;s allowed scopes and run manual previews.</p> : null}
            {agent.agentType === "connected" ? <p className="field-help">Some agents cannot fetch passport links directly (e.g. Gemini memory, ChatGPT system prompts). If the agent cannot read the link, open the passport page and paste the Agent memory block into the agent instead.</p> : null}
            {agent.publicPassportTokenPreview ? <p>Current passport token: <code>{agent.publicPassportTokenPreview}</code></p> : null}
          </Card>
          <Card className="dashboard-panel">
            <h2>{agent.agentType === "connected" ? "Developer integration" : "Manual testing"}</h2>
            <p>{agent.agentType === "connected" ? "When your app or provider can call BehalfID, use the SDK/API for automatic enforcement." : "Native agents can also use a passport link for manual allow/deny testing."}</p>
            <CodeBlock label="verify.ts">{buildVerifySnippet(agent.agentId, detail.data?.permissions)}</CodeBlock>
          </Card>
        </section>
      ) : null}
      <form className="dashboard-panel form-grid" onSubmit={createPermission}>
        <label>
          <span>Scope template</span>
          <select value={agentViewScopeId} onChange={(e) => {
            const scopeId = e.target.value;
            setAgentViewScopeId(scopeId);
            if (!scopeId) return;
            const scope = SCOPE_TEMPLATES.find((t) => t.id === scopeId);
            if (!scope || scope.id === "custom") return;
            const template = actionToPermTemplate(scope.defaultAction);
            setForm({
              template,
              action: scope.defaultAction,
              resource: scope.exampleResource,
              allowedActions: scope.defaultAllowedActions.join(", "),
              blockedActions: scope.defaultBlockedActions.join(", "),
              requiresApproval: scope.requiresApprovalDefault,
              maxAmount: "",
              expiresAt: "",
              scope: ""
            });
          }}>
            <option value="">Select a scope template (optional)</option>
            {SCOPE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <small className="field-help">Scopes are reusable permission patterns. You can edit the fields below before saving.</small>
        </label>
        <label>
          <span>Template</span>
          <select value={form.template} onChange={(e) => {
            const t = e.target.value as PermissionTemplate | "";
            const presets: Partial<Record<PermissionTemplate, string>> = {
              access_data: "access_data", create_content: "create_content", schedule: "schedule", purchase: "purchase"
            };
            setForm({ ...form, template: t, action: presets[t as PermissionTemplate] ?? form.action });
          }}>
            <option value="">No template</option>
            {permissionTemplates.map((t) => <option key={t.value} value={t.value}>{t.title}</option>)}
          </select>
        </label>
        <label>
          <span>Action</span>
          <input placeholder="access_data, schedule, purchase" required value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} />
        </label>
        <label>
          <span>Resource / service</span>
          <input placeholder="gmail.com, google-calendar, coachella.com" value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} />
        </label>
        <label>
          <span>Allowed actions</span>
          <input placeholder="read labels, summarize docs, suggest times" value={form.allowedActions} onChange={(e) => setForm({ ...form, allowedActions: e.target.value })} />
          <small className="field-help">Comma-separated — what this permission explicitly allows.</small>
        </label>
        <label>
          <span>Blocked actions</span>
          <input placeholder="send email, delete files, make purchases" value={form.blockedActions} onChange={(e) => setForm({ ...form, blockedActions: e.target.value })} />
          <small className="field-help">Comma-separated — what this agent must never do.</small>
        </label>
        {form.template !== "purchase" ? (
          <label>
            <span>Requires approval</span>
            <select value={form.requiresApproval ? "yes" : "no"} onChange={(e) => setForm({ ...form, requiresApproval: e.target.value === "yes" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        ) : null}
        {form.template === "purchase" ? (
          <label>
            <span>Max amount</span>
            <input min="0" placeholder="Optional, e.g. 800" type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
          </label>
        ) : null}
        <label>
          <span>Expires at</span>
          <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <Button variant="primary" type="submit">Create permission</Button>
      </form>
      <h2>Permissions</h2>
      <div className="dashboard-list">{(detail.data?.permissions ?? []).map((p) => <div key={p.permissionId}><span><strong>{p.action}</strong><small>{dashboardPermissionSummary(p)}</small></span><Badge>{p.status}</Badge>{p.status === "active" ? <Button onClick={() => revoke(p.permissionId)}>Revoke</Button> : null}</div>)}</div>
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

function actionToPermTemplate(action: string): PermissionTemplate {
  if (action === "schedule") return "schedule";
  if (action === "purchase") return "purchase";
  if (["create_content", "send_email", "send_message"].includes(action)) return "create_content";
  if (!action) return "custom";
  return "access_data";
}

function buildVerifySnippet(agentId: string, permissions: Permission[] | undefined): string {
  const active = permissions?.find((p) => p.status === "active");
  const action = active?.action ?? "access_data";
  const vendor = active?.resource ?? active?.constraints?.allowedVendors?.[0] ?? "gmail.com";
  const scope = active?.allowedActions?.[0] ?? active?.scope ?? null;
  const metaBlock = scope ? `,\n  metadata: {\n    scope: "${scope}"\n  }` : "";
  return `import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "${agentId}",
  action: "${action}",
  vendor: "${vendor}"${metaBlock}
});`;
}

function dashboardPermissionSummary(permission: Permission) {
  const constraints = permission.constraints ?? {};
  const parts = [
    permission.resource ? `on ${permission.resource}` : null,
    permission.allowedActions?.length ? `allows: ${permission.allowedActions.join(", ")}` : (permission.scope ?? null),
    typeof constraints.maxAmount === "number" ? `max $${constraints.maxAmount}` : null,
    permission.requiresApproval ? "requires approval" : null,
    permission.blockedActions?.length ? `blocks: ${permission.blockedActions.join(", ")}` : null,
    constraints.expiresAt ? `expires ${date(constraints.expiresAt)}` : null,
    permission.status
  ].filter(Boolean);
  return parts.join(" / ") || permission.permissionId;
}
