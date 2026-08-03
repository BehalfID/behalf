"use client";

import { useState, type FormEvent } from "react";
import { Button, EmptyState, StatCard } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import type { AgentDetail, AgentProvider, SecurityPosture } from "./types";

const PROVIDERS: Array<{ value: AgentProvider; label: string }> = [
  { value: "ollie", label: "Ollie" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "zapier", label: "Zapier" },
  { value: "make", label: "Make" },
  { value: "langchain", label: "LangChain" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama" },
  { value: "custom", label: "Custom" },
  { value: "other", label: "Other" }
];

type ProfileForm = Pick<
  AgentDetail,
  "name" | "provider" | "externalAgentId" | "externalAgentLabel" | "description" | "ollamaBaseUrl" | "ollamaModel"
>;

export function AgentOverview({
  agent,
  posture,
  reload
}: {
  agent: AgentDetail;
  posture: SecurityPosture;
  reload: () => Promise<void>;
}) {
  const { apiJson } = useDashboardApi();
  const [profile, setProfile] = useState<ProfileForm>({
    name: agent.name,
    provider: agent.provider,
    externalAgentId: agent.externalAgentId ?? "",
    externalAgentLabel: agent.externalAgentLabel ?? "",
    description: agent.description ?? "",
    ollamaBaseUrl: agent.ollamaBaseUrl ?? "",
    ollamaModel: agent.ollamaModel ?? ""
  });
  const [guidelines, setGuidelines] = useState<string[]>(agent.guidelines ?? []);
  const [newGuideline, setNewGuideline] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState("");

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const body: Record<string, unknown> = {
        name: profile.name,
        provider: profile.provider,
        externalAgentId: profile.externalAgentId,
        externalAgentLabel: profile.externalAgentLabel,
        description: profile.description
      };
      if (profile.provider === "ollama") {
        body.ollamaBaseUrl = profile.ollamaBaseUrl?.trim() || null;
        body.ollamaModel = profile.ollamaModel?.trim() || null;
      }
      await apiJson(`/api/dashboard/agents/${agent.agentId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      await reload();
      setNotice("Agent profile saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent profile save failed.");
    }
  };

  const testOllama = async () => {
    setError("");
    setOllamaTestResult("");
    setOllamaTesting(true);
    try {
      const result = await apiJson<{
        ok: boolean;
        model?: string;
        baseUrl?: string;
        availableModels?: string[];
        details?: string;
        error?: string;
      }>(`/api/dashboard/agents/${agent.agentId}/ollama/test`, { method: "POST" });
      if (result.ok) {
        setOllamaTestResult(
          `Connected to ${result.baseUrl} — model ${result.model} is available` +
            (result.availableModels?.length ? ` (${result.availableModels.length} models installed).` : ".")
        );
      } else {
        setError(result.error ?? result.details ?? "Ollama connection failed.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ollama connection failed.");
    } finally {
      setOllamaTesting(false);
    }
  };

  const addGuideline = () => {
    const value = newGuideline.trim();
    if (!value || guidelines.includes(value) || guidelines.length >= 20) return;
    setGuidelines((current) => [...current, value]);
    setNewGuideline("");
  };

  const saveGuidelines = async () => {
    setError("");
    setNotice("");
    try {
      await apiJson(`/api/dashboard/agents/${agent.agentId}`, {
        method: "PATCH",
        body: JSON.stringify({ guidelines })
      });
      await reload();
      setNotice("Guidelines saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Guidelines save failed.");
    }
  };

  const setStatus = async (status: "enable" | "disable") => {
    if (status === "disable" && !window.confirm("Disable this agent? Its current credential will stop authorizing requests.")) return;
    setError("");
    setNotice("");
    try {
      await apiJson(`/api/dashboard/agents/${agent.agentId}/${status}`, { method: "POST" });
      await reload();
      setNotice(status === "disable" ? "Agent disabled." : "Agent enabled.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent status update failed.");
    }
  };

  return (
    <div className="agent-section-stack">
      <section aria-labelledby="security-posture-title">
        <div className="agent-section-heading">
          <div>
            <h2 id="security-posture-title">Security posture</h2>
            <p>Permission and denial totals for this agent. Recent denials cover the last seven days.</p>
          </div>
        </div>
        <div className="metric-grid agent-posture-grid">
          <StatCard label="Active permissions" value={posture.activePermissions} />
          <StatCard label="Approval-gated" value={posture.approvalGatedPermissions} />
          <StatCard label="Revoked permissions" value={posture.revokedPermissions} />
          <StatCard label="Recent denied actions" value={posture.recentDeniedActions} />
        </div>
      </section>

      {notice ? <div className="dashboard-banner" role="status">{notice}</div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <form className="dashboard-panel agent-edit-form" id="agent-profile" onSubmit={saveProfile}>
        <div className="agent-edit-form__full-col">
          <h2>Identity and status</h2>
          <p className="field-help">Edit how this agent is identified. Permissions are managed separately.</p>
        </div>
        <label>
          <span>Name</span>
          <input required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
        </label>
        <label>
          <span>Provider</span>
          <select value={profile.provider} onChange={(event) => setProfile({ ...profile, provider: event.target.value as AgentProvider })}>
            {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
        </label>
        <label>
          <span>External reference</span>
          <input
            placeholder="Workspace, handle, or internal label"
            value={profile.externalAgentLabel ?? ""}
            onChange={(event) => setProfile({ ...profile, externalAgentLabel: event.target.value })}
          />
        </label>
        <label>
          <span>External ID</span>
          <input value={profile.externalAgentId ?? ""} onChange={(event) => setProfile({ ...profile, externalAgentId: event.target.value })} />
        </label>
        <label className="agent-edit-form__full-col">
          <span>Description</span>
          <textarea rows={3} value={profile.description ?? ""} onChange={(event) => setProfile({ ...profile, description: event.target.value })} />
        </label>
        {profile.provider === "ollama" ? (
          <>
            <label className="agent-edit-form__full-col">
              <span>Ollama base URL</span>
              <input
                placeholder="http://localhost:11434 (or leave blank to use server OLLAMA_BASE_URL)"
                value={profile.ollamaBaseUrl ?? ""}
                onChange={(event) => setProfile({ ...profile, ollamaBaseUrl: event.target.value })}
              />
            </label>
            <label>
              <span>Ollama model</span>
              <input
                placeholder="llama3.1:8b"
                value={profile.ollamaModel ?? ""}
                onChange={(event) => setProfile({ ...profile, ollamaModel: event.target.value })}
              />
            </label>
            <div className="agent-edit-form__full-col">
              <p className="field-help">
                Optional developer convenience for tagging this agent&apos;s local model and testing connectivity.
                BehalfID may forward chat/tags to this endpoint — it does <strong>not</strong> enforce tool policy by hosting the model.
                Leave blank to fall back to server <code>OLLAMA_*</code> env vars.
              </p>
            </div>
          </>
        ) : null}
        <div className="form-actions agent-edit-form__full-col">
          <Button variant="primary" type="submit">Save profile</Button>
          {profile.provider === "ollama" ? (
            <Button disabled={ollamaTesting} onClick={() => void testOllama()} type="button">
              {ollamaTesting ? "Testing…" : "Test Ollama connection"}
            </Button>
          ) : null}
        </div>
        {ollamaTestResult ? <p className="field-help agent-edit-form__full-col" role="status">{ollamaTestResult}</p> : null}
      </form>

      <section className="dashboard-panel" aria-labelledby="agent-guidelines-title">
        <h2 id="agent-guidelines-title">Guidelines</h2>
        <p className="field-help">Behavioral rules that apply across services and appear in MCP context and permission passports.</p>
        {guidelines.length ? (
          <ul className="guidelines-list">
            {guidelines.map((guideline, index) => (
              <li key={`${guideline}-${index}`}>
                <span>{guideline}</span>
                <Button onClick={() => setGuidelines((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</Button>
              </li>
            ))}
          </ul>
        ) : <EmptyState className="dashboard-empty">No guidelines yet.</EmptyState>}
        <label>
          <span>Add guideline</span>
          <input
            maxLength={500}
            onChange={(event) => setNewGuideline(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGuideline(); } }}
            placeholder="Always ask before deleting files"
            value={newGuideline}
          />
        </label>
        <div className="form-actions">
          <Button disabled={!newGuideline.trim() || guidelines.length >= 20} onClick={addGuideline} type="button">Add</Button>
          <Button onClick={() => void saveGuidelines()} type="button" variant="primary">Save guidelines</Button>
        </div>
      </section>

      <section className="dashboard-panel agent-danger-zone" aria-labelledby="agent-danger-title">
        <div>
          <h2 id="agent-danger-title">Danger area</h2>
          <p>{agent.status === "active" ? "Disabling stops this agent credential from authorizing new requests." : "This agent is disabled. Re-enable it only when its integration is ready."}</p>
        </div>
        {agent.status === "active" ? (
          <Button onClick={() => void setStatus("disable")} type="button" variant="danger">Disable agent</Button>
        ) : (
          <Button onClick={() => void setStatus("enable")} type="button">Enable agent</Button>
        )}
      </section>
    </div>
  );
}
