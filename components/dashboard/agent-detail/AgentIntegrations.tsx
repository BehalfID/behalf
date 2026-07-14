"use client";

import { useState } from "react";
import { Badge, Button, ButtonLink, CodeBlock } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { formatAgentDate, formatAgentProvider } from "./format";
import type { AgentDetail, AgentPermission } from "./types";

function buildVerifySnippet(agentId: string, permissions: AgentPermission[]) {
  const active = permissions.find((permission) => permission.status === "active");
  const action = active?.action ?? "access_data";
  const vendor = active?.resource ?? active?.constraints?.allowedVendors?.[0] ?? "service.example";
  return `import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "${agentId}",
  action: "${action}",
  vendor: "${vendor}"
});

if (!result.allowed) throw new Error(result.reason);`;
}

function OneTimeCredential({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="secret-panel one-time-credential" role="status">
      <div>
        <strong>{label}</strong>
        <p>Shown once. Store it in your secret manager now.</p>
      </div>
      <code>{value}</code>
      <Button onClick={() => void copy()} type="button">{copied ? "Copied" : "Copy"}</Button>
    </div>
  );
}

export function AgentIntegrations({
  agent,
  permissions,
  reload
}: {
  agent: AgentDetail;
  permissions: AgentPermission[];
  reload: () => Promise<void>;
}) {
  const { apiJson } = useDashboardApi();
  const [newApiKey, setNewApiKey] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [error, setError] = useState("");

  const rotate = async () => {
    if (!window.confirm("Rotate this agent API key? The old key will stop working immediately.")) return;
    setError("");
    try {
      const result = await apiJson<{ apiKey: string }>(`/api/dashboard/agents/${agent.agentId}/rotate-key`, { method: "POST" });
      setNewApiKey(result.apiKey);
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Key rotation failed.");
    }
  };

  const createPassport = async () => {
    setError("");
    try {
      const result = await apiJson<{ passportUrl: string }>(`/api/dashboard/agents/${agent.agentId}/passport`, { method: "POST" });
      setPassportUrl(result.passportUrl);
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Passport creation failed.");
    }
  };

  return (
    <div className="agent-section-stack">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {newApiKey ? <OneTimeCredential label="Rotated agent API key" value={newApiKey} /> : null}
      {passportUrl ? <OneTimeCredential label="New passport link" value={passportUrl} /> : null}

      <section className="dashboard-panel" id="credential-management" aria-labelledby="credential-status-title">
        <div className="dashboard-section-header">
          <div>
            <h2 id="credential-status-title">Credential status</h2>
            <p>BehalfID stores only a hash of the agent API key. Stored credential values are never displayed.</p>
          </div>
          <Button onClick={() => void rotate()} type="button">Rotate key</Button>
        </div>
        <dl className="console-definition agent-integration-definition">
          <div><dt>Status</dt><dd><Badge>{agent.status === "active" ? "Credential active" : "Agent disabled"}</Badge></dd></div>
          <div><dt>Last rotation</dt><dd>{formatAgentDate(agent.keyRotatedAt, "Original credential")}</dd></div>
          <div><dt>Agent ID</dt><dd><code>{agent.agentId}</code></dd></div>
        </dl>
      </section>

      <section className="dashboard-panel" aria-labelledby="sdk-setup-title">
        <div className="dashboard-section-header">
          <div>
            <h2 id="sdk-setup-title">SDK setup</h2>
            <p>Call verify before the external action and fail closed on denied decisions.</p>
          </div>
          <ButtonLink href="/sandbox" rel="noopener noreferrer" target="_blank">Open sandbox</ButtonLink>
        </div>
        <CodeBlock label="verify.ts">{buildVerifySnippet(agent.agentId, permissions)}</CodeBlock>
      </section>

      <section className="dashboard-panel" aria-labelledby="cli-setup-title">
        <h2 id="cli-setup-title">CLI setup</h2>
        <p>Install the CLI and provide the one-time key through your environment or secret manager.</p>
        <CodeBlock label="terminal">{`npm install -g @behalfid/cli
export BEHALFID_API_KEY="<one-time-agent-key>"
behalf status`}</CodeBlock>
      </section>

      {agent.provider === "claude" ? (
        <section className="dashboard-panel" aria-labelledby="claude-status-title">
          <div className="dashboard-section-header">
            <div>
              <h2 id="claude-status-title">Claude Code hook status</h2>
              <p>Hook runtime status is not reported to this dashboard. Use <code>behalf status</code> in the configured workspace to confirm it.</p>
            </div>
            <Badge>Not reported</Badge>
          </div>
        </section>
      ) : null}

      <section className="dashboard-panel" aria-labelledby="mcp-config-title">
        <div className="dashboard-section-header">
          <div>
            <h2 id="mcp-config-title">MCP configuration</h2>
            <p>MCP context is advisory. Enforcement still depends on SDK, API, CLI, or provider integration checks before actions execute.</p>
          </div>
          <Badge>Advisory</Badge>
        </div>
        <CodeBlock label="mcp.json">{`{
  "mcpServers": {
    "behalfid": {
      "command": "behalf",
      "args": ["mcp"],
      "env": { "BEHALFID_AGENT_ID": "${agent.agentId}" }
    }
  }
}`}</CodeBlock>
      </section>

      <section className="dashboard-panel" aria-labelledby="passport-title">
        <div className="dashboard-section-header">
          <div>
            <h2 id="passport-title">Passport and manual integration</h2>
            <p>Create a new manual passport link when an assistant cannot call the enforcement API directly.</p>
          </div>
          <Button onClick={() => void createPassport()} type="button">
            {agent.publicPassportEnabled ? "Regenerate passport link" : "Create passport link"}
          </Button>
        </div>
        <p className="field-help">A newly generated link is shown once. Existing passport tokens are not rendered.</p>
      </section>

      <section className="dashboard-panel" aria-labelledby="external-metadata-title">
        <h2 id="external-metadata-title">External integration metadata</h2>
        <dl className="console-definition agent-integration-definition">
          <div><dt>Provider</dt><dd>{formatAgentProvider(agent.provider)}</dd></div>
          <div><dt>Connection</dt><dd>{formatAgentProvider(agent.connectionStatus)}</dd></div>
          <div><dt>External reference</dt><dd>{agent.externalAgentLabel || "Not set"}</dd></div>
          <div><dt>External ID</dt><dd>{agent.externalAgentId || "Not set"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
