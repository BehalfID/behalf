"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, PageHeader } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";

type CliLine =
  | { id: string; kind: "input"; text: string }
  | { id: string; kind: "stdout"; text: string }
  | { id: string; kind: "stderr"; text: string }
  | { id: string; kind: "meta"; text: string };

type CliConfig = {
  agentId?: string;
  apiKey?: string;
  baseUrl?: string;
};

type ExecResponse = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  clear?: boolean;
  config?: CliConfig;
};

const CONFIG_STORAGE_KEY = "behalfid.browserCli.config";
const HISTORY_STORAGE_KEY = "behalfid.browserCli.history";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadConfig(): CliConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CliConfig;
    return {
      agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : undefined,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined
    };
  } catch {
    return {};
  }
}

function saveConfig(config: CliConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-100) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-100)));
}

export function BrowserCliTerminal({
  initialAgentId,
  suggestedVerify
}: {
  initialAgentId?: string;
  suggestedVerify?: {
    allowed?: { action: string; vendor?: string };
    denied?: { action: string; vendor?: string; amount?: number };
  };
} = {}) {
  const { apiJson } = useDashboardApi();
  const [lines, setLines] = useState<CliLine[]>([
    {
      id: "welcome",
      kind: "meta",
      text: "BehalfID browser terminal — type a command or choose a preset. OS shells are blocked."
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<CliConfig>({});
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = loadConfig();
    if (initialAgentId && !stored.agentId) {
      stored.agentId = initialAgentId;
      saveConfig(stored);
    }
    setConfig(stored);
    setHistory(loadHistory());
  }, [initialAgentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, busy]);

  const presets = useMemo(() => {
    const agentId = config.agentId ?? "<agentId>";
    const allowed = suggestedVerify?.allowed ?? { action: "browse_web", vendor: "web" };
    const denied = suggestedVerify?.denied ?? { action: "purchase", vendor: "example-store.com", amount: 5000 };
    return [
      { label: "help", command: "behalf --help" },
      { label: "doctor", command: "behalf doctor" },
      { label: "agents list", command: "behalf agents list" },
      {
        label: "permissions list",
        command: `behalf permissions list ${agentId}`
      },
      {
        label: "verify allowed",
        command: `behalf verify ${agentId} --action ${allowed.action}${allowed.vendor ? ` --vendor ${allowed.vendor}` : ""}`
      },
      {
        label: "verify denied",
        command: `behalf verify ${agentId} --action ${denied.action}${denied.vendor ? ` --vendor ${denied.vendor}` : ""}${
          denied.amount !== undefined ? ` --amount ${denied.amount}` : ""
        }`
      }
    ];
  }, [config.agentId, suggestedVerify]);

  const appendLines = useCallback((next: CliLine[]) => {
    setLines((prev) => [...prev, ...next]);
  }, []);

  const runCommand = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      appendLines([{ id: newId(), kind: "input", text: trimmed }]);
      setInput("");
      setHistoryIndex(null);
      const nextHistory = [...history.filter((item) => item !== trimmed), trimmed].slice(-100);
      setHistory(nextHistory);
      saveHistory(nextHistory);

      try {
        const result = await apiJson<ExecResponse>("/api/dashboard/cli/exec", {
          method: "POST",
          body: JSON.stringify({ command: trimmed, config })
        });
        if (result.clear) {
          setLines([
            {
              id: newId(),
              kind: "meta",
              text: "Terminal cleared."
            }
          ]);
        } else {
          const out: CliLine[] = [];
          if (result.stdout) out.push({ id: newId(), kind: "stdout", text: result.stdout });
          if (result.stderr) out.push({ id: newId(), kind: "stderr", text: result.stderr });
          if (!result.stdout && !result.stderr) {
            out.push({
              id: newId(),
              kind: "meta",
              text: result.ok ? "(no output)" : `Command exited with code ${result.exitCode}.`
            });
          }
          appendLines(out);
        }
        if (result.config) {
          const merged = { ...config, ...result.config };
          setConfig(merged);
          saveConfig(merged);
        }
      } catch (error) {
        appendLines([
          {
            id: newId(),
            kind: "stderr",
            text: error instanceof Error ? error.message : "Command failed."
          }
        ]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [apiJson, appendLines, busy, config, history]
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runCommand(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex] ?? "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex === null) return;
      if (historyIndex >= history.length - 1) {
        setHistoryIndex(null);
        setInput("");
        return;
      }
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex] ?? "");
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      void runCommand("behalf clear");
    }
  };

  const copyOutput = async () => {
    const text = lines
      .map((line) => {
        if (line.kind === "input") return `$ ${line.text}`;
        return line.text;
      })
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="browser-cli">
      <PageHeader
        className="dashboard-header browser-cli__header"
        description="Run real BehalfID CLI commands in the browser. Shells and filesystem tools are rejected."
        title="CLI"
        action={
          <div className="browser-cli__actions">
            <Button type="button" onClick={() => void copyOutput()}>
              {copied ? "Copied" : "Copy output"}
            </Button>
            <Button type="button" onClick={() => void runCommand("behalf clear")} disabled={busy}>
              Clear
            </Button>
          </div>
        }
      />

      <div className="browser-cli__presets" role="group" aria-label="Demo command presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="browser-cli__preset"
            disabled={busy}
            onClick={() => {
              setInput(preset.command);
              inputRef.current?.focus();
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="browser-cli__terminal" aria-label="BehalfID terminal">
        <div className="browser-cli__scroll" ref={scrollRef} tabIndex={0}>
          {lines.map((line) => (
            <pre key={line.id} className={`browser-cli__line browser-cli__line--${line.kind}`}>
              {line.kind === "input" ? `$ ${line.text}` : line.text}
            </pre>
          ))}
          {busy ? (
            <pre className="browser-cli__line browser-cli__line--meta" role="status">
              Running…
            </pre>
          ) : null}
        </div>
        <form className="browser-cli__prompt" onSubmit={onSubmit}>
          <span className="browser-cli__prompt-mark" aria-hidden="true">
            $
          </span>
          <label className="sr-only" htmlFor="browser-cli-input">
            Command
          </label>
          <input
            id="browser-cli-input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            placeholder="behalf agents list"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Run
          </Button>
        </form>
      </div>

      <p className="browser-cli__hint">
        Session config{config.agentId ? `: agent ${config.agentId}` : " unset"}. Use{" "}
        <code>behalf config set agent-id &lt;id&gt;</code> after creating an agent. Up/Down for history · Ctrl+L to clear.
      </p>
    </div>
  );
}
