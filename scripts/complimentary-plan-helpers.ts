import { COMPLIMENTARY_PLANS, type ComplimentaryPlan } from "@/lib/planGrants";

export type ComplimentaryPlanCommand = "status" | "grant" | "revoke";

export type ComplimentaryPlanArgs = {
  command: ComplimentaryPlanCommand;
  accountId: string;
  plan: ComplimentaryPlan | null;
  reason: string | null;
  /** null means a lifetime grant. */
  expiresAt: Date | null;
  actor: string | null;
  dryRun: boolean;
  confirm: boolean;
};

export function isValidAccountId(accountId: string) {
  return /^acct_[A-Za-z0-9_-]+$/.test(accountId);
}

function requireValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

/**
 * Parses "lifetime" or an ISO-8601 date. A bare date-only string is accepted and
 * read as UTC midnight, because an operator typing 2027-01-01 means the whole of
 * 2026, not "whenever midnight is where the server happens to be".
 */
export function parseExpiry(value: string): Date | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "lifetime" || trimmed === "never") return null;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : value.trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--expires must be an ISO-8601 date or "lifetime". Received: ${value}`);
  }
  return parsed;
}

export function parseComplimentaryPlanArgs(argv: string[]): ComplimentaryPlanArgs {
  const [command, ...rest] = argv;
  if (command !== "status" && command !== "grant" && command !== "revoke") {
    throw new Error(`First argument must be one of: status, grant, revoke. Received: ${command ?? "(none)"}`);
  }

  const options: Partial<ComplimentaryPlanArgs> = {
    command,
    plan: null,
    reason: null,
    expiresAt: null,
    actor: null,
    dryRun: false,
    confirm: false
  };
  let expirySeen = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case "--account-id":
        options.accountId = requireValue(rest, index, arg);
        index += 1;
        break;
      case "--plan": {
        const value = requireValue(rest, index, arg);
        if (!(COMPLIMENTARY_PLANS as readonly string[]).includes(value)) {
          throw new Error(
            `--plan must be one of: ${COMPLIMENTARY_PLANS.join(", ")}. Received: ${value}`
          );
        }
        options.plan = value as ComplimentaryPlan;
        index += 1;
        break;
      }
      case "--reason":
        options.reason = requireValue(rest, index, arg);
        index += 1;
        break;
      case "--expires":
        options.expiresAt = parseExpiry(requireValue(rest, index, arg));
        expirySeen = true;
        index += 1;
        break;
      case "--actor":
        options.actor = requireValue(rest, index, arg);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--confirm":
        options.confirm = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.accountId) throw new Error("--account-id is required.");
  if (!isValidAccountId(options.accountId)) {
    throw new Error(`--account-id must match acct_<id>. Received: ${options.accountId}`);
  }

  if (command === "status") {
    return { ...(options as ComplimentaryPlanArgs), dryRun: true, confirm: false };
  }

  if (options.dryRun && options.confirm) {
    throw new Error("Use either --dry-run or --confirm, not both.");
  }
  if (!options.dryRun && !options.confirm) {
    throw new Error("Specify one mode: --dry-run or --confirm.");
  }
  if (!options.reason?.trim()) {
    throw new Error("--reason is required so the grant ledger stays auditable.");
  }

  if (command === "grant") {
    if (!options.plan) throw new Error("--plan is required for grant.");
    // Silence here would mean "lifetime", which is too consequential to be a
    // default. Lifetime must be spelled out.
    if (!expirySeen) {
      throw new Error('--expires is required for grant. Use an ISO-8601 date or "lifetime".');
    }
  }

  if (command === "revoke" && options.plan) {
    throw new Error("--plan is not valid for revoke; the current grant is what gets revoked.");
  }

  return options as ComplimentaryPlanArgs;
}

export function formatExpiry(expiresAt: Date | null) {
  return expiresAt ? expiresAt.toISOString() : "lifetime (no expiry)";
}

export type StatusLike = {
  accountId: string;
  accountName: string;
  billingPlan: string;
  effectivePlan: string;
  stripeLinked: boolean;
  grant: {
    plan: string;
    reason: string | null;
    grantedBy: string | null;
    grantedAt: Date | null;
    expiresAt: Date | null;
    expired: boolean;
  } | null;
  ledgerMismatch: boolean;
  ledger: Array<{
    grantId: string;
    action: string;
    plan: string | null;
    reason: string;
    actor: string;
    actorType: string;
    createdAt: Date | null;
  }>;
};

export function formatStatus(status: StatusLike): string {
  const lines = [
    `Account ${status.accountId} — ${status.accountName}`,
    `  billing plan (Stripe-owned): ${status.billingPlan}`,
    `  effective plan:              ${status.effectivePlan}`,
    `  Stripe linked:               ${status.stripeLinked ? "yes" : "no"}`
  ];

  if (status.grant) {
    lines.push(
      `  complimentary grant:         ${status.grant.plan}${status.grant.expired ? " (EXPIRED)" : ""}`,
      `    reason:    ${status.grant.reason ?? "(none recorded)"}`,
      `    grantedBy: ${status.grant.grantedBy ?? "(unknown)"}`,
      `    grantedAt: ${status.grant.grantedAt?.toISOString() ?? "(unknown)"}`,
      `    expires:   ${formatExpiry(status.grant.expiresAt)}`
    );
  } else {
    lines.push("  complimentary grant:         none");
  }

  if (status.ledgerMismatch) {
    lines.push(
      "  WARNING: the newest ledger entry does not match current state.",
      "           A ledger write may have been recorded without being applied."
    );
  }

  lines.push(`  ledger entries: ${status.ledger.length}`);
  for (const entry of status.ledger.slice(0, 10)) {
    lines.push(
      `    ${entry.createdAt?.toISOString() ?? "(no date)"} ${entry.action}` +
        `${entry.plan ? ` -> ${entry.plan}` : ""} by ${entry.actor} (${entry.actorType})` +
        ` — ${entry.reason}`
    );
  }

  return lines.join("\n");
}
