import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicAuthSplitCTA } from "@/components/layout/PublicAuthSplitCTA";
import { ButtonLink, CodeBlock } from "@/components/ui";

export const metadata = {
  title: "Security and trust — BehalfID",
  description:
    "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, webhooks, and current limitations."
};

const limitations = [
  "No provider-native integrations yet. Connected agents are represented manually inside BehalfID — BehalfID does not call Ollie, ChatGPT, Claude, or Zapier APIs on your behalf.",
  "Manual mode depends on user and agent cooperation. The external agent must read the passport and respect the listed constraints; BehalfID cannot enforce behavior inside third-party providers.",
  "Site Guard is a planned website-owner enforcement pattern, not a global crawler blocker. It only protects routes or workflows where the website installs middleware, a proxy, worker, or gateway that calls BehalfID and respects the decision.",
  "Sign in with Google is available for developer accounts. Workspace Google SSO (company domain allowlist and optional password enforcement) is available on Pro and higher. The admin console still uses one shared password. SAML and non-Google IdPs are not supported yet.",
  "No formal external security audit yet. BehalfID is suitable for constrained deployments and demos, not open public multi-tenant use without further hardening.",
  "Not a replacement for app-level authorization. BehalfID is a pre-action verification layer. Your app still needs its own auth, input validation, and access control.",
  "Rate limiting falls back to process memory without Upstash Redis. In serverless environments, in-memory counters are not shared across instances."
];

const revocationItems = [
  ["Revoke a permission", "The next verify call for that action returns denied immediately."],
  ["Disable an agent", "All verify calls for that agent are denied while it is disabled."],
  ["Rotate an API key", "The old key stops working at the next request. A new key is shown once."],
  ["Regenerate a passport link", "The old passport token becomes invalid. Anyone with the old link can no longer read scopes or run previews."]
];

export default function SecurityPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="security-page">
        <header className="security-hero">
          <p className="section-kicker">Security and trust</p>
          <h1>Enforcement model,<br />trust posture, limitations.</h1>
          <p className="security-lede">
            BehalfID is designed to verify agent actions before they happen, keep secrets out of
            public views, and make denied actions fail closed when integrated.
          </p>
          <p className="security-lede">
            This page explains the enforcement model, what secrets are stored and how, the public
            passport design, and the current known limitations.
          </p>
        </header>

        {/* 1. Enforcement model */}
        <section className="security-section">
          <div className="security-section__label">
            <span>01</span>
            <h2>Enforcement model</h2>
          </div>
          <div className="security-section__body">
            <p>
              BehalfID does not magically control an agent by itself. The app or provider must call
              BehalfID before acting. If the action is denied, the integration should fail closed and
              not execute the action.
            </p>
            <p>
              Fail closed means the agent throws on denial and the code that would execute the action
              never runs. The opposite — fail open — would let the agent proceed if the check fails
              or is unavailable. BehalfID&apos;s recommended enforcement pattern is always fail closed.
            </p>
            <CodeBlock label="enforce.ts">{`const result = await behalf.verify({
  agentId,
  action: "purchase",
  vendor: "coachella.com",
  amount: 742
});

if (!result.allowed) {
  throw new Error(\`Blocked by BehalfID: \${result.reason}\`);
}

// Only execute the action after this point.`}</CodeBlock>
            <p>
              Enforcement only works when the integration calls BehalfID before acting and
              respects the response. See the{" "}
              <Link href="/sandbox">live sandbox</Link> for a browser-based demonstration.
            </p>
            <div className="security-note">
              BehalfID Site Guard extends this pattern to websites: your middleware, worker, proxy,
              or gateway calls BehalfID before protected routes such as checkout, forms, login,
              account changes, data export, or admin workflows. User-Agent detection is best-effort
              and spoofable; verified agent identity requires a future signed credential.
            </div>
          </div>
        </section>

        {/* 2. Manual mode limitations */}
        <section className="security-section">
          <div className="security-section__label">
            <span>02</span>
            <h2>Manual mode limitations</h2>
          </div>
          <div className="security-section__body">
            <p>
              Manual mode is for testing with existing agents — Ollie, ChatGPT, Claude, Zapier,
              Make, or others — without requiring the provider to integrate BehalfID.
            </p>
            <ul className="security-list">
              <li>
                Passport links let an agent or human read the allowed scopes for one agent.
                The agent can read what it is permitted to do and use those constraints to guide
                its decisions.
              </li>
              <li>
                <strong>Fragment token limitation.</strong> Passport links use a{" "}
                <code>#token=…</code> URL fragment, keeping the token out of server logs and
                referrer headers. However, most AI agents — Gemini memory, ChatGPT system prompts,
                Claude project instructions — do not execute JavaScript or send authorization
                headers and cannot retrieve the scoped data. For these agents, use the copyable
                blocks on the passport page.
              </li>
              <li>
                <strong>Agent memory block (best-effort).</strong> A structured plain-English copy
                of the active scopes. Paste into a memory field or system prompt. Some assistants
                compress or ignore saved memory and may not preserve exact scopes — treat this as
                best-effort, not a reliable enforcement boundary.
              </li>
              <li>
                <strong>Per-task permission prompt (more reliable).</strong> Paste this directly
                into the same chat where the agent is about to act. It includes the full scope
                list, a blocked actions section, and asks the agent to answer three questions before
                proceeding. More reliable than memory because it is in the active context window,
                not stored state.
              </li>
              <li>
                Manual mode does not automatically enforce behavior inside a third-party provider.
                If an agent reads the passport and ignores the constraints, BehalfID cannot stop it.
              </li>
              <li>
                Developer integration — calling <code>behalf.verify()</code> before every action —
                remains the only path to automatic enforcement.
              </li>
            </ul>
            <div className="security-note">
              Manual mode is a testing and communication tool, not an enforcement boundary.
              The per-task prompt is more reliable than memory for consumer assistants, but
              developer integration is the only real automatic enforcement path.
            </div>
          </div>
        </section>

        {/* 3. Secrets and tokens */}
        <section className="security-section">
          <div className="security-section__label">
            <span>03</span>
            <h2>Secrets and tokens</h2>
          </div>
          <div className="security-section__body">
            <div className="security-grid">
              <div className="security-card">
                <strong>Agent API keys</strong>
                <p>
                  Shown once at creation or rotation and never again. Only a SHA-256 hash is
                  stored. If you lose the key, rotate it to get a new one.
                </p>
              </div>
              <div className="security-card">
                <strong>Passport tokens</strong>
                <p>
                  A separate <code>bhf_pass_</code> token scoped to one agent. Passport tokens
                  allow viewing the agent&apos;s active permission scopes and running manual previews.
                  They are not API keys.
                </p>
              </div>
              <div className="security-card">
                <strong>What passport tokens cannot do</strong>
                <p>
                  Create or edit permissions, rotate API keys, view audit logs, access developer
                  accounts, or read webhook secrets. Treat the passport link like a secret — anyone
                  with the token can read the allowed scopes.
                </p>
              </div>
              <div className="security-card">
                <strong>Webhook signing secrets</strong>
                <p>
                  Shown once at creation or rotation. Stored as a derived hash. Only a preview
                  prefix is shown after creation. Receivers verify signatures with
                  <code> verifyWebhookSignature</code> from the SDK.
                </p>
              </div>
              <div className="security-card">
                <strong>Developer passwords</strong>
                <p>
                  Hashed with scrypt. The developer portal requires at least 10 characters.
                  Sessions use HTTP-only cookies backed by the database.
                </p>
              </div>
              <div className="security-card">
                <strong>Timing-safe comparisons</strong>
                <p>
                  API key hash comparisons use <code>crypto.timingSafeEqual</code> to prevent
                  timing-based enumeration.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Public passport safety */}
        <section className="security-section">
          <div className="security-section__label">
            <span>04</span>
            <h2>Public passport safety</h2>
          </div>
          <div className="security-section__body">
            <p>
              Passport pages intentionally expose active allowed scopes. That is the point: an
              external agent needs to read what it is allowed to do before acting.
            </p>
            <p>What the passport page exposes:</p>
            <ul className="security-list">
              <li>Agent name, type, and provider metadata.</li>
              <li>Active permission scopes: action, resource, allowed actions, blocked actions, requires-approval flag, expiration.</li>
              <li>Passport version and mode label.</li>
            </ul>
            <p>What the passport page never exposes:</p>
            <ul className="security-list security-list--safe">
              <li>API keys or key hashes.</li>
              <li>Developer email, account ID, or session data.</li>
              <li>Webhook secrets or endpoint URLs.</li>
              <li>Audit logs or verification history.</li>
              <li>Internal MongoDB IDs.</li>
              <li>Revoked or expired permissions.</li>
            </ul>
            <div className="security-note">
              Do not create permissions containing sensitive data that should not be visible to
              anyone with the passport token. The passport is intentionally readable.
            </div>
          </div>
        </section>

        {/* 5. Audit logs */}
        <section className="security-section">
          <div className="security-section__label">
            <span>05</span>
            <h2>Audit logs</h2>
          </div>
          <div className="security-section__body">
            <p>
              Every authenticated verification decision is logged with a stable{" "}
              <code>requestId</code>, the decision result, reason, risk level, action, vendor, and
              amount when provided.
            </p>
            <ul className="security-list">
              <li>Logs help developers debug allowed and denied decisions.</li>
              <li>
                Logs are scoped: agent API keys can only read logs for their own agent. Dashboard
                users only see logs for their own agents.
              </li>
              <li>
                Manual passport previews do not create audit log entries by design. Only
                integrated <code>POST /api/verify</code> calls are logged.
              </li>
              <li>
                Optional <code>metadata</code> is only stored when{" "}
                <code>BEHALFID_LOG_METADATA</code> is not set to <code>false</code>. Action,
                vendor, and amount are always stored and may be sensitive.
              </li>
            </ul>
          </div>
        </section>

        {/* 6. Webhooks */}
        <section className="security-section">
          <div className="security-section__label">
            <span>06</span>
            <h2>Webhooks</h2>
          </div>
          <div className="security-section__body">
            <p>
              BehalfID signs every webhook event with HMAC-SHA256 over{" "}
              <code>timestamp.rawBody</code> using the stored derived key from the{" "}
              <code>whsec_</code> secret. Verify signatures with{" "}
              <code>verifyWebhookSignature</code> from <code>@behalfid/sdk</code> before
              processing any event.
            </p>
            <ul className="security-list">
              <li>Events are persisted to an outbox before delivery and retried with a capped five-attempt backoff.</li>
              <li>Failed events reach a dead-letter state after five attempts. Developers can replay them from the console.</li>
              <li>
                <strong>Delivery is at-least-once, not exactly-once.</strong> Receivers must
                deduplicate events by <code>eventId</code> to handle replays safely.
              </li>
              <li>Webhook payloads never include API keys, setup tokens, webhook secrets, or rotated keys.</li>
              <li>
                Webhook URL validation requires <code>https://</code> in production and rejects
                obvious localhost or private IP destinations.
              </li>
            </ul>
          </div>
        </section>

        {/* 7. Revocation */}
        <section className="security-section">
          <div className="security-section__label">
            <span>07</span>
            <h2>Revocation</h2>
          </div>
          <div className="security-section__body">
            <p>All critical objects can be invalidated without waiting for expiration.</p>
            <div className="security-grid security-grid--2col">
              {revocationItems.map(([title, body]) => (
                <div className="security-card" key={title}>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Current limitations */}
        <section className="security-section">
          <div className="security-section__label">
            <span>08</span>
            <h2>Current limitations</h2>
          </div>
          <div className="security-section__body">
            <p>
              BehalfID is a prototype. These are real limitations worth knowing before deploying
              in sensitive environments.
            </p>
            <ul className="security-list">
              {limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              See <Link href="/docs/concepts">Concepts</Link> for the full model and{" "}
              <a
                href="https://github.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                the project README
              </a>{" "}
              for production deployment recommendations.
            </p>
          </div>
        </section>

        {/* 9. Contact */}
        <section className="security-section security-section--last">
          <div className="security-section__label">
            <span>09</span>
            <h2>Contact</h2>
          </div>
          <div className="security-section__body">
            <p>
              Questions or security concerns? Contact the project owner through GitHub or open an
              issue in the project repository.
            </p>
            <div className="hero__actions">
              <PublicAuthSplitCTA leftLabel="Build" leftHref="/signup" />
              <ButtonLink href="/docs">Docs</ButtonLink>
            </div>
          </div>
        </section>
      </div>
      <PublicFooter />
    </main>
  );
}
