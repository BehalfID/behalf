import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { isRecord, readString } from "@/lib/validation";

// ────────────────────────────────────────────────────────────────────────────
// Config — read inside handler so pre-flight checks see the real env values
// ────────────────────────────────────────────────────────────────────────────

function ollamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "",
    model: process.env.OLLAMA_MODEL ?? "",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? "30000"),
    // Optional bearer token forwarded to the secure proxy. Never sent to the browser.
    proxyToken: process.env.OLLAMA_PROXY_TOKEN ?? ""
  };
}

/** Headers to attach to every upstream Ollama/proxy request. */
function ollamaAuthHeaders(proxyToken: string): Record<string, string> {
  return proxyToken ? { Authorization: `Bearer ${proxyToken}` } : {};
}

// ────────────────────────────────────────────────────────────────────────────
// Structured diagnostic error responses — never creates DB records
// ────────────────────────────────────────────────────────────────────────────

type DiagCode =
  | "NOT_CONFIGURED"
  | "LOCALHOST_IN_PRODUCTION"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "MODEL_NOT_FOUND"
  | "INVALID_RESPONSE"
  | "OLLAMA_ERROR"
  | "OLLAMA_PROXY_AUTH_FAILED";

function diagError(
  httpStatus: number,
  code: DiagCode,
  error: string,
  details: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error, details, code, ...extra }, { status: httpStatus });
}

// ────────────────────────────────────────────────────────────────────────────
// Output types (mirrored in client.tsx — keep in sync)
// ────────────────────────────────────────────────────────────────────────────

type DraftConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: null;
};

type DraftPermission = {
  action: string;
  resource: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  status: "active";
  constraints?: DraftConstraints;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};

type PermissionDraftResponse = {
  agentDraft: { provider: string; description: string };
  permissions: DraftPermission[];
  needsClarification: { question: string; reason: string }[];
  warnings: string[];
  limitations: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// System prompt
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a permission passport drafting assistant for BehalfID, a permission control system for AI agents.

Your task: read the user's plain-English description of what they want an AI assistant to do, then return a single JSON object.

Return ONLY this JSON object — no markdown, no code fences, no explanation, no text before or after the JSON.

The object must match this exact shape:

{
  "agentDraft": {
    "provider": "string (the assistant provider name as given)",
    "description": "string (1-2 sentence summary of the agent purpose)"
  },
  "permissions": [
    {
      "action": "string (snake_case verb: access_data | create_content | schedule | purchase | browse_web | send_email | send_message | or a custom snake_case verb)",
      "resource": "string (e.g. gmail.com, google-calendar, web, stripe.com — empty string if not applicable)",
      "allowedActions": ["string (2-5 specific things the agent may do)"],
      "blockedActions": ["string (2-5 specific things the agent must never do)"],
      "requiresApproval": boolean,
      "status": "active",
      "constraints": {
        "maxAmount": number or null,
        "allowedVendors": ["string"],
        "expiresAt": null
      },
      "riskLevel": "low" | "medium" | "high",
      "reason": "string (one sentence explaining why this permission was drafted)"
    }
  ],
  "needsClarification": [
    {
      "question": "string (a specific question to ask the user)",
      "reason": "string (why this is unclear from the description)"
    }
  ],
  "warnings": ["string (things the user should consider before confirming)"],
  "limitations": ["string (constraints you could not capture from the description)"]
}

Rules:
1. Return 1-3 permissions that fully cover the user's description. Do not over-split.
2. requiresApproval must be true for: financial actions, destructive/irreversible actions, sending external messages, and any time the user said "ask before".
3. riskLevel: low = read-only no external effects; medium = creates content or sends something; high = financial, destructive, or irreversible.
4. Infer blockedActions from explicit "do not", "but not", "never" language. When in doubt, add protective blocked actions.
5. Set constraints.maxAmount only when the user stated a spending limit — use the numeric value (e.g. 25 for "$25").
6. Set needsClarification when important scope or limits are ambiguous (leave empty array if the description is clear).
7. Set warnings for: broad access grants, financial permissions, "send on my behalf" permissions.
8. Set limitations for things you could not encode (e.g. "No spending limit specified — consider adding one.").
9. Every permission must have at least one allowedAction and one blockedAction.`;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function extractJson(raw: string): unknown {
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try { return JSON.parse(stripped); } catch {}

  const objStart = stripped.indexOf("{");
  const objEnd = stripped.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(stripped.slice(objStart, objEnd + 1)); } catch {}
  }

  const arrStart = stripped.indexOf("[");
  const arrEnd = stripped.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(stripped.slice(arrStart, arrEnd + 1)); } catch {}
  }

  return null;
}

const VALID_RISK = new Set(["low", "medium", "high"]);

function sanitizePermission(p: unknown): DraftPermission | null {
  if (!isRecord(p)) return null;
  const action = readString(p.action) || "access_data";
  const resource = readString(p.resource) || "";
  const allowedActions = extractStringArray(p.allowedActions);
  const blockedActions = extractStringArray(p.blockedActions);
  const requiresApproval = p.requiresApproval === true;
  const riskRaw = readString(p.riskLevel);
  const riskLevel: "low" | "medium" | "high" = VALID_RISK.has(riskRaw)
    ? (riskRaw as "low" | "medium" | "high")
    : "medium";
  const reason = readString(p.reason) || "Permission drafted from your description.";

  let constraints: DraftConstraints | undefined;
  if (isRecord(p.constraints)) {
    const maxAmountRaw = p.constraints.maxAmount;
    const maxAmount = typeof maxAmountRaw === "number" && maxAmountRaw > 0 ? maxAmountRaw : undefined;
    const allowedVendors = extractStringArray(p.constraints.allowedVendors).filter(Boolean);
    if (maxAmount !== undefined || allowedVendors.length > 0) {
      constraints = {
        maxAmount,
        allowedVendors: allowedVendors.length ? allowedVendors : undefined,
        expiresAt: null
      };
    }
  }

  return { action, resource, allowedActions, blockedActions, requiresApproval, status: "active", constraints, riskLevel, reason };
}

function buildDraftResponse(parsed: unknown, provider: string, description: string): PermissionDraftResponse {
  let rawPermissions: unknown[] = [];
  let rawAgentDraft: unknown = undefined;
  let rawClarifications: unknown[] = [];
  let rawWarnings: unknown[] = [];
  let rawLimitations: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawPermissions = parsed;
  } else if (isRecord(parsed)) {
    rawPermissions = Array.isArray(parsed.permissions) ? (parsed.permissions as unknown[]) : [];
    rawAgentDraft = parsed.agentDraft;
    rawClarifications = Array.isArray(parsed.needsClarification) ? (parsed.needsClarification as unknown[]) : [];
    rawWarnings = Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]) : [];
    rawLimitations = Array.isArray(parsed.limitations) ? (parsed.limitations as unknown[]) : [];
  }

  const permissions = rawPermissions
    .slice(0, 5)
    .map(sanitizePermission)
    .filter((p): p is DraftPermission => p !== null);

  const agentDraft = {
    provider: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.provider) : "") || provider,
    description: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.description) : "") || description
  };

  const needsClarification: { question: string; reason: string }[] = rawClarifications
    .slice(0, 5)
    .flatMap((item) => {
      if (!isRecord(item)) return [];
      const question = readString(item.question);
      const reason = readString(item.reason);
      return question ? [{ question, reason }] : [];
    });

  const warnings = rawWarnings.filter((x): x is string => typeof x === "string").slice(0, 5);
  const limitations = rawLimitations.filter((x): x is string => typeof x === "string").slice(0, 5);

  return { agentDraft, permissions, needsClarification, warnings, limitations };
}

async function fetchAvailableModels(baseUrl: string, proxyToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: ollamaAuthHeaders(proxyToken),
      signal: AbortSignal.timeout(5_000)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Route handler — never creates DB records, only returns a draft
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  // ── A: Missing env vars ──────────────────────────────────────────────────
  const { baseUrl: rawBaseUrl, model: rawModel, timeoutMs, proxyToken } = ollamaConfig();
  if (!rawBaseUrl || !rawModel) {
    return diagError(503, "NOT_CONFIGURED",
      "AI-assisted drafting is not configured.",
      "Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env.local, then restart the Next.js server or redeploy Vercel."
    );
  }

  const OLLAMA_BASE_URL = rawBaseUrl;
  const OLLAMA_MODEL = rawModel;

  // ── B: Localhost in production ───────────────────────────────────────────
  const isLocalhost = /localhost|127\.0\.0\.1/.test(OLLAMA_BASE_URL);
  if (process.env.NODE_ENV === "production" && isLocalhost) {
    return diagError(503, "LOCALHOST_IN_PRODUCTION",
      "Ollama is configured as localhost in production.",
      "In production, localhost points to the Vercel server, not your Mac. Use local development (npm run dev), or configure a secure reachable Ollama proxy."
    );
  }

  // ── Validate request body ────────────────────────────────────────────────
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");

  const provider = readString(body.provider);
  const description = readString(body.description);
  if (!description || description.length < 5) return jsonError("description is required (minimum 5 characters).");
  if (description.length > 2000) return jsonError("description must be 2000 characters or fewer.");

  const userMessage = [
    provider ? `Assistant provider: ${provider}` : null,
    `User request: ${description}`
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── Call Ollama ──────────────────────────────────────────────────────────
  let raw: string;
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaAuthHeaders(proxyToken) },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      // ── Proxy auth failure ─────────────────────────────────────────────
      if (res.status === 401 || res.status === 403) {
        return diagError(503, "OLLAMA_PROXY_AUTH_FAILED",
          "Ollama proxy rejected the request.",
          "Check that OLLAMA_PROXY_TOKEN is set correctly in BehalfID and on the proxy server. They must match."
        );
      }

      const text = await res.text().catch(() => "");
      const lowerText = text.toLowerCase();
      const isModelMissing =
        res.status === 404 ||
        lowerText.includes("not found") ||
        lowerText.includes("pull it first") ||
        lowerText.includes("model not found");

      if (isModelMissing) {
        // ── D: Model unavailable ───────────────────────────────────────────
        const availableModels = await fetchAvailableModels(OLLAMA_BASE_URL, proxyToken);
        return diagError(503, "MODEL_NOT_FOUND",
          "Configured Ollama model is not available.",
          `Run \`ollama pull ${OLLAMA_MODEL}\` on the machine running Ollama, or change OLLAMA_MODEL to an installed model.`,
          { configuredModel: OLLAMA_MODEL, availableModels }
        );
      }

      return diagError(503, "OLLAMA_ERROR",
        "Ollama returned an error.",
        text ? text.slice(0, 300) : `HTTP ${res.status} from Ollama.`
      );
    }

    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) {
      return diagError(503, "OLLAMA_ERROR", "Ollama returned an error.", data.error);
    }
    raw = data.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || msg.includes("timed out"));
    const isRefused =
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("network");

    if (isTimeout) {
      // ── Timeout ────────────────────────────────────────────────────────
      return diagError(503, "TIMEOUT",
        "Ollama timed out.",
        `Ollama did not respond within ${timeoutMs / 1000}s. Try a smaller/faster model, or increase OLLAMA_TIMEOUT_MS.`
      );
    }
    if (isRefused) {
      // ── C: Unreachable ─────────────────────────────────────────────────
      return diagError(503, "UNREACHABLE",
        "Ollama is not reachable.",
        `The BehalfID server cannot reach ${OLLAMA_BASE_URL}. ` +
        `If testing locally, make sure Ollama is running (ollama serve) and restart Next.js after editing .env.local. ` +
        `If using Vercel, Ollama must be reachable through a secure proxy.`
      );
    }
    return diagError(503, "UNREACHABLE", "Ollama request failed.", msg);
  }

  // ── E: Invalid/empty model output ────────────────────────────────────────
  if (!raw.trim()) {
    return diagError(502, "INVALID_RESPONSE",
      "Ollama returned an invalid draft.",
      "The model returned an empty response. Try again or use a stronger model."
    );
  }

  const parsed = extractJson(raw);
  if (parsed === null) {
    return diagError(502, "INVALID_RESPONSE",
      "Ollama returned an invalid draft.",
      "The model did not return valid JSON. Try again or use a stronger model."
    );
  }

  const draft = buildDraftResponse(parsed, provider, description);

  if (draft.permissions.length === 0) {
    return diagError(502, "INVALID_RESPONSE",
      "Ollama returned an invalid draft.",
      "The model did not produce any permissions. Try a more specific description or a stronger model."
    );
  }

  return NextResponse.json(draft);
}
