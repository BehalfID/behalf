"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CodeBlock, Logo } from "@/components/ui";
import { SCOPE_TEMPLATES, SCOPE_CATEGORY_LABELS } from "@/lib/scopeTemplates";

type PassportAgent = {
  agentId: string;
  name: string;
  agentType: string;
  provider: string;
  connectionStatus: string;
  description?: string | null;
};

type PassportPermission = {
  action: string;
  resource: string | null;
  scope: string | null;
  description: string | null;
  allowedActions: string[] | null;
  blockedActions: string[] | null;
  requiresApproval: boolean | null;
  notes: string | null;
  template: string | null;
  maxAmount: number | null;
  expiresAt: string | null;
  status: string;
};

type PassportData = {
  passportVersion: string;
  mode: string;
  agent: PassportAgent;
  permissions: PassportPermission[];
  limitations: string[];
};

type PassportDecision = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: string;
};

async function passportApi<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? "Request failed.");
  return body as T;
}

export function PassportClient({ agentId, token: initialToken }: { agentId: string; token: string }) {
  const [token, setToken] = useState(initialToken);
  const [tokenReady, setTokenReady] = useState(Boolean(initialToken));
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ action: "", resource: "", amount: "", context: "" });
  const [decision, setDecision] = useState<PassportDecision | null>(null);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      if (!initialToken) {
        setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
      }
      setTokenReady(true);
    });
  }, [initialToken]);

  useEffect(() => {
    if (!tokenReady) return;
    if (!token) return;
    let cancelled = false;
    passportApi<PassportData>(`/api/passport/${agentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((result) => {
        if (!cancelled) setPassport(result);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Invalid passport link.");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, token, tokenReady]);

  const test = async (event: FormEvent) => {
    event.preventDefault();
    setVerifyError("");
    setDecision(null);
    try {
      setDecision(
        await passportApi<PassportDecision>(`/api/passport/${agentId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: form.action,
            resource: form.resource || undefined,
            amount: form.amount ? Number(form.amount) : undefined,
            context: form.context || undefined
          })
        })
      );
    } catch (requestError) {
      setVerifyError(requestError instanceof Error ? requestError.message : "Verification failed.");
    }
  };

  const agent = passport?.agent;
  const permissions = passport?.permissions ?? [];
  const passportHref = typeof window !== "undefined" ? window.location.href : "";

  const instructions = `You are connected to my BehalfID permission passport.

Open the passport link and read the Allowed scopes section or Machine-readable passport section before deciding what you are allowed to do.

Before taking an external action, compare the requested action against the allowed scopes in this passport. If the action is not listed, exceeds a limit, is expired, or conflicts with a blocked action, ask me to verify it first.

If BehalfID denies the action, do not proceed.

Permission passport:
${passportHref}`;

  const machineReadable = passport
    ? JSON.stringify(
        {
          passportVersion: passport.passportVersion,
          mode: passport.mode,
          agent: {
            agentId: passport.agent.agentId,
            name: passport.agent.name,
            provider: passport.agent.provider,
            agentType: passport.agent.agentType
          },
          permissions: passport.permissions.map((p) => ({
            action: p.action,
            ...(p.resource ? { resource: p.resource } : {}),
            ...(p.scope ? { scope: p.scope } : {}),
            ...(p.description ? { description: p.description } : {}),
            ...(p.allowedActions?.length ? { allowedActions: p.allowedActions } : {}),
            ...(p.blockedActions?.length ? { blockedActions: p.blockedActions } : {}),
            ...(p.requiresApproval !== null ? { requiresApproval: p.requiresApproval } : {}),
            ...(p.maxAmount !== null ? { maxAmount: p.maxAmount } : {}),
            ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}),
            status: p.status
          })),
          limitations: passport.limitations
        },
        null,
        2
      )
    : "";

  return (
    <main className="passport-page">
      <section className="passport-shell">
        <div className="passport-header">
          <Logo />
          <Link href="/docs/concepts">How passports work</Link>
        </div>

        {/* A: Passport summary */}
        <div className="passport-hero">
          <p className="section-kicker">Manual test mode</p>
          <h1>{agent?.name ?? "Permission passport"}</h1>
          <div className="agent-passport__header">
            <span className="console-status">{agent?.agentType ?? "agent"}</span>
            <span className="console-status">{agent?.provider ?? "provider"}</span>
            <span className="console-status">{agent?.connectionStatus ?? "manual"}</span>
          </div>
          {agent?.description ? <p>{agent.description}</p> : null}
          <p>
            This is a manual permission passport. It describes what this agent is allowed to do.
            Automatic enforcement requires the app or provider to integrate BehalfID.
          </p>
          <p>This page does not expose API keys, logs, developer accounts, or permission editing.</p>
          {error || (tokenReady && !token) ? <p className="form-error">{error || "Invalid passport link."}</p> : null}
        </div>

        {/* B: Allowed scopes */}
        {passport ? (
          <section className="passport-section">
            <h2>Allowed scopes</h2>
            <p>This passport lists the active scopes for this agent. Each scope defines what this agent may and may not do.</p>
            {permissions.length === 0 ? (
              <p className="passport-warning">No active permissions on this passport.</p>
            ) : (
              <div className="passport-scopes">
                {permissions.map((p, i) => {
                  const scopeTemplate = SCOPE_TEMPLATES.find((t) => t.id === p.template || (t.defaultAction === p.action && t.id !== "custom"));
                  const scopeLabel = scopeTemplate?.label ?? p.action;
                  const categoryLabel = scopeTemplate ? SCOPE_CATEGORY_LABELS[scopeTemplate.category] : null;
                  return (
                    <div className="passport-scope-card dashboard-panel" key={i}>
                      <div className="agent-passport__header">
                        <span className="console-status console-status--active">{scopeLabel}</span>
                        {categoryLabel ? <span className="console-status">{categoryLabel}</span> : null}
                        {p.resource ? <span className="console-status">{p.resource}</span> : null}
                      </div>
                      {p.scope ? <p>{p.scope}</p> : null}
                      {p.description ? <p>{p.description}</p> : null}
                      <dl className="passport-scope-meta">
                        {p.allowedActions?.length ? (
                          <div><dt>Allowed</dt><dd>{p.allowedActions.join(", ")}</dd></div>
                        ) : null}
                        {p.maxAmount !== null ? (
                          <div><dt>Max amount</dt><dd>${p.maxAmount}</dd></div>
                        ) : null}
                        {p.blockedActions?.length ? (
                          <div><dt>Blocked</dt><dd>{p.blockedActions.join(", ")}</dd></div>
                        ) : null}
                        {p.requiresApproval ? (
                          <div><dt>Requires approval</dt><dd>Yes</dd></div>
                        ) : null}
                        {p.expiresAt ? (
                          <div><dt>Expires</dt><dd>{new Date(p.expiresAt).toLocaleString()}</dd></div>
                        ) : null}
                        {p.notes ? (
                          <div><dt>Notes</dt><dd>{p.notes}</dd></div>
                        ) : null}
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {/* C: Instructions for the agent */}
        {passport ? (
          <section className="passport-section">
            <h2>Instructions for the agent</h2>
            <p>
              Before taking an external action, compare the requested action against the allowed
              scopes in this passport.
            </p>
            <p>
              If the action is not listed, exceeds a limit, is expired, or conflicts with a blocked
              action, ask the user to verify first.
            </p>
            <p>If BehalfID denies the action, do not proceed.</p>
            <p>Copy these into Ollie, ChatGPT, Claude, or another assistant for a manual test workflow.</p>
            <CodeBlock label="copy into your agent">{instructions}</CodeBlock>
            <p className="passport-warning">
              Treat this passport link like a secret. Anyone with the token can view this agent&apos;s
              allowed scopes and run manual previews.
            </p>
          </section>
        ) : null}

        {/* D: Machine-readable passport */}
        {passport ? (
          <section className="passport-section">
            <h2>Machine-readable passport</h2>
            <p>
              Send this to an agent or tool that reads JSON. All data shown here is public-safe for
              this passport link and does not include API keys, logs, developer identity, or secrets.
            </p>
            <CodeBlock label="passport.json">{machineReadable}</CodeBlock>
          </section>
        ) : null}

        {/* E: Manual verification form */}
        {passport ? (
          <section className="passport-section">
            <form className="dashboard-panel" onSubmit={test}>
              <h2>Manual preview</h2>
              <p>Use this to manually preview whether an action fits the permission passport.</p>
              <label>
                <span>Action</span>
                <input
                  placeholder="access_data, create_content, schedule, purchase"
                  value={form.action}
                  onChange={(event) => setForm({ ...form, action: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Resource / service</span>
                <input
                  placeholder="gmail.com, slack, google-calendar, coachella.com"
                  value={form.resource}
                  onChange={(event) => setForm({ ...form, resource: event.target.value })}
                />
              </label>
              <label>
                <span>Amount (optional)</span>
                <input
                  min="0"
                  placeholder="Only relevant for purchases"
                  type="number"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </label>
              <label>
                <span>Context (optional)</span>
                <input
                  placeholder="Optional notes about the action"
                  value={form.context}
                  onChange={(event) => setForm({ ...form, context: event.target.value })}
                />
              </label>
              <button className="ui-button ui-button--primary" type="submit">
                Test verification
              </button>
              <p className="field-help">
                Manual preview does not control the external agent unless the provider or app
                integrates BehalfID.
              </p>
              {verifyError ? <p className="form-error">{verifyError}</p> : null}
              {decision ? (
                <div className="passport-result">
                  <strong>{decision.allowed ? "Allowed" : "Denied"}</strong>
                  <p>{decision.reason}</p>
                </div>
              ) : null}
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
