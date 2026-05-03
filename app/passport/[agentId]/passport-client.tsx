"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CodeBlock, Logo } from "@/components/ui";

type PassportAgent = {
  agentId: string;
  name: string;
  agentType: string;
  provider: string;
  description?: string | null;
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
  const [agent, setAgent] = useState<PassportAgent | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ action: "purchase", vendor: "coachella.com", amount: "742" });
  const [decision, setDecision] = useState<PassportDecision | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (!initialToken) {
        setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
      }
      setTokenReady(true);
    });
  }, [initialToken]);

  useEffect(() => {
    if (!tokenReady) {
      return;
    }
    if (!token) {
      return;
    }
    let cancelled = false;
    passportApi<{ agent: PassportAgent }>(`/api/passport/${agentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((result) => {
        if (!cancelled) setAgent(result.agent);
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
    setError("");
    setDecision(null);
    try {
      setDecision(await passportApi<PassportDecision>(`/api/passport/${agentId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: form.action,
          vendor: form.vendor || undefined,
          amount: form.amount ? Number(form.amount) : undefined
        })
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Verification failed.");
    }
  };

  const instructions = `You are connected to my BehalfID permission passport.

Before taking actions involving purchases, scheduling, sending messages, or external services, ask me to verify the action through BehalfID.

Permission passport:
${typeof window === "undefined" ? "" : window.location.href}

If BehalfID denies the action, do not proceed.`;

  return (
    <main className="passport-page">
      <section className="passport-shell">
        <div className="passport-header">
          <Logo />
          <Link href="/docs/concepts">How passports work</Link>
        </div>
        <div className="passport-hero">
          <p className="section-kicker">Manual test mode</p>
          <h1>{agent?.name ?? "Permission passport"}</h1>
          <p>
            Test whether an action would be allowed for this agent. This page does not expose
            API keys, logs, developer accounts, or permission editing.
          </p>
          <div className="agent-passport__header">
            <span className="console-status">{agent?.agentType ?? "agent"}</span>
            <span className="console-status">{agent?.provider ?? "provider"}</span>
          </div>
          {agent?.description ? <p>{agent.description}</p> : null}
        </div>
        <section className="passport-grid">
          <form className="dashboard-panel" onSubmit={test}>
            <h2>Test an action</h2>
            <label><span>Action</span><input value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} required /></label>
            <label><span>Vendor / service / workflow</span><input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} /></label>
            <label><span>Amount</span><input min="0" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
            <button className="ui-button ui-button--primary" type="submit">Test verification</button>
            {error || (tokenReady && !token) ? <p className="form-error">{error || "Invalid passport link."}</p> : null}
            {decision ? (
              <div className="passport-result">
                <strong>{decision.allowed ? "Allowed" : "Denied"}</strong>
                <p>{decision.reason}</p>
              </div>
            ) : null}
          </form>
          <div className="dashboard-panel">
            <h2>Instructions for your agent</h2>
            <p>Copy these into Ollie, ChatGPT, Claude, or another assistant for a manual test workflow.</p>
            <CodeBlock label="manual instructions">{instructions}</CodeBlock>
            <p className="passport-warning">This does not automatically control the external agent. Developer integration is required for automatic enforcement.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
