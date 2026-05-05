import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { isRecord, readString } from "@/lib/validation";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? "30000");

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
  return (value as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

function extractJson(raw: string): unknown {
  // Strip markdown fences
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Direct parse
  try { return JSON.parse(stripped); } catch {}

  // Find outermost { … }
  const objStart = stripped.indexOf("{");
  const objEnd = stripped.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(stripped.slice(objStart, objEnd + 1)); } catch {}
  }

  // Fallback: maybe the model returned a bare array
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
  const riskLevel: "low" | "medium" | "high" = VALID_RISK.has(riskRaw) ? (riskRaw as "low" | "medium" | "high") : "medium";
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
  // Support both the full object format and a fallback bare-array format
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

  const permissions = rawPermissions.slice(0, 5).map(sanitizePermission).filter((p): p is DraftPermission => p !== null);

  const agentDraft = {
    provider: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.provider) : "") || provider,
    description: (isRecord(rawAgentDraft) ? readString(rawAgentDraft.description) : "") || description
  };

  const needsClarification: { question: string; reason: string }[] = rawClarifications.slice(0, 5).flatMap((item) => {
    if (!isRecord(item)) return [];
    const question = readString(item.question);
    const reason = readString(item.reason);
    return question ? [{ question, reason }] : [];
  });

  const warnings = rawWarnings.filter((x): x is string => typeof x === "string").slice(0, 5);
  const limitations = rawLimitations.filter((x): x is string => typeof x === "string").slice(0, 5);

  return { agentDraft, permissions, needsClarification, warnings, limitations };
}

// ────────────────────────────────────────────────────────────────────────────
// Route handler — never creates DB records, only returns a draft
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");

  const provider = readString(body.provider);
  const description = readString(body.description);
  if (!description || description.length < 5) return jsonError("description is required (minimum 5 characters).");
  if (description.length > 2000) return jsonError("description must be 2000 characters or fewer.");

  const userMessage = [
    provider ? `Assistant provider: ${provider}` : null,
    `User request: ${description}`
  ].filter(Boolean).join("\n\n");

  let raw: string;
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const detail = text ? `: ${text.slice(0, 200)}` : "";
      return jsonError(
        `Ollama returned an error (HTTP ${res.status})${detail}. ` +
        `Check that the model "${OLLAMA_MODEL}" is pulled (ollama pull ${OLLAMA_MODEL}) ` +
        `and that OLLAMA_BASE_URL is set correctly.`
      );
    }

    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) return jsonError(`Ollama error: ${data.error}`);
    raw = data.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = msg.includes("timed out") || msg.includes("TimeoutError");
    const isRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    if (isTimeout) {
      return jsonError(
        `Ollama timed out after ${OLLAMA_TIMEOUT_MS / 1000}s. ` +
        `Try a smaller model or increase OLLAMA_TIMEOUT_MS.`
      );
    }
    if (isRefused) {
      return jsonError(
        `Cannot reach Ollama at ${OLLAMA_BASE_URL}. ` +
        `Make sure Ollama is running (ollama serve) and OLLAMA_BASE_URL is correct.`
      );
    }
    return jsonError(`Ollama request failed: ${msg}`);
  }

  if (!raw.trim()) return jsonError("Ollama returned an empty response. Try rephrasing your description.");

  const parsed = extractJson(raw);
  if (parsed === null) {
    return jsonError("AI did not return valid JSON. Try rephrasing your description or use a different model.");
  }

  const draft = buildDraftResponse(parsed, provider, description);

  if (draft.permissions.length === 0) {
    return jsonError("AI did not produce any permissions. Try a more specific description.");
  }

  return NextResponse.json(draft);
}
