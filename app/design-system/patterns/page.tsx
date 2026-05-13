import Link from "next/link";
import { Logo } from "@/components/ui";
import s from "../sub.module.css";

const DSNav = ({ current }: { current: string }) => (
  <header className={s.topnav}>
    <div className={s.topnavInner}>
      <div className={s.topnavGroup}>
        <Logo href="/design-system" />
        <span className={s.topnavDivider} />
        <span className={s.topnavSub}>design system</span>
      </div>
      <nav className={s.topnavLinks}>
        <Link href="/design-system" aria-current={current === "overview" ? "page" : undefined}>Overview</Link>
        <Link href="/design-system/characteristics" aria-current={current === "characteristics" ? "page" : undefined}>Characteristics</Link>
        <Link href="/design-system/brand" aria-current={current === "brand" ? "page" : undefined}>Brand</Link>
        <Link href="/design-system/colors" aria-current={current === "colors" ? "page" : undefined}>Color</Link>
        <Link href="/design-system/typography" aria-current={current === "typography" ? "page" : undefined}>Type</Link>
        <Link href="/design-system/components" aria-current={current === "components" ? "page" : undefined}>Components</Link>
        <Link href="/design-system/patterns" aria-current={current === "patterns" ? "page" : undefined}>Patterns</Link>
      </nav>
      <div className={s.topnavCta}>
        <span className={s.versionBadge}>v1.0</span>
        <Link className={s.buildBtn} href="/design-system/components">Build →</Link>
      </div>
    </div>
  </header>
);

function DecisionPacket({ decision = "denied" }: { decision?: "denied" | "allowed" }) {
  const isDeny = decision === "denied";
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-2xl)", overflow: "hidden", background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 36%), rgba(10,10,10,0.86)", boxShadow: "var(--shadow-hero)", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)", color: "var(--muted)", font: "700 0.78rem/1 var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.025)", minHeight: 44 }}>
        <span>Action request</span><span>POST /v1/verify</span>
      </div>
      {[
        { label: "Agent", value: "agent_ollie", mono: true },
        { label: "Action", value: "purchase", mono: false },
        { label: "Vendor", value: "coachella.com", mono: true },
        { label: "Amount", value: "$742.00", mono: true },
      ].map(({ label, value, mono }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
          <span style={{ color: "var(--text)", font: mono ? "600 0.96rem/1.2 var(--font-mono)" : "600 1.05rem/1.2 var(--font-sans)" }}>{value}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "18px 22px", background: "var(--accent-glow)", borderTop: "1px solid rgba(99,102,241,0.32)", borderBottom: "1px solid rgba(99,102,241,0.32)", color: "var(--accent)", font: "700 0.74rem/1 var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", minHeight: 36 }}>
        <span>BehalfID decision boundary</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Decision</span>
        <span style={{ color: isDeny ? "var(--deny)" : "var(--ok)", font: "700 1.6rem/1 var(--font-sans)", letterSpacing: "-0.01em" }}>{decision}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Reason</span>
        <span style={{ color: "var(--text)", font: "600 0.96rem/1.2 var(--font-sans)" }}>No active purchase permission.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", background: "rgba(99,102,241,0.06)" }}>
        <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Audit</span>
        <span style={{ color: "var(--muted)", font: "600 0.86rem/1 var(--font-mono)" }}>verification.denied · req_3xZ9q</span>
      </div>
    </div>
  );
}

const pipelineSteps = [
  { num: "01", title: "Action request", copy: "Agent, action, resource, vendor, amount, route — packaged before execution." },
  { num: "02", title: "Decision boundary", copy: "BehalfID verifies the request against the active passport before the tool runs." },
  { num: "03", title: "Execution state", copy: "Allowed actions continue. Denied or missing permissions fail closed." },
  { num: "04", title: "Audit event", copy: "Decision, reason, and enforcement result recorded for review and webhooks." },
];

const actions = [
  { type: "allow", action: "access_data", title: "Read calendar", copy: "Allowed by passport rule \"calendar.read\" until 2026-06-01.", vendor: "gmail.com", borderColor: "rgba(34,197,94,0.5)" },
  { type: "warn", action: "send_email", title: "Send recap", copy: "Needs approval — passport requires human confirm above 5 recipients.", vendor: "gmail.com", borderColor: "rgba(234,179,8,0.5)" },
  { type: "deny", action: "purchase", title: "Buy ticket", copy: "Denied — no active purchase permission. Fail closed.", vendor: "coachella.com", borderColor: "rgba(239,68,68,0.5)" },
];

const logEntries = [
  { time: "18:42:01", type: "deny", text: "denied   agent_ollie · purchase · coachella.com · $742.00 · req_3xZ9q", color: "var(--deny)" },
  { time: "18:39:18", type: "allow", text: "allowed agent_ollie · access_data · gmail.com · req_3xZ9p", color: "var(--ok)" },
  { time: "18:36:44", type: "warn", text: "needs_approval  agent_ollie · send_email · gmail.com · req_3xZ9o", color: "var(--warn)" },
  { time: "18:31:02", type: "allow", text: "allowed agent_ollie · access_data · notion.so · req_3xZ9n", color: "var(--ok)" },
];

export default function PatternsPage() {
  return (
    <>
      <DSNav current="patterns" />

      <div className={s.doc}>

        <p className={s.kicker}>Patterns</p>
        <h1 className={s.h1}>Compositions that show the boundary.</h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          Components are blocks; patterns are how they&apos;re arranged so the user reads the decision moment correctly. The decision packet is the signature element — every layout that explains how BehalfID works should make a verify call legible somewhere on the page.
        </p>

        {/* ── Decision packet ── */}
        <h2 className={s.h2}>Decision packet</h2>
        <p className={s.lede} style={{ marginBottom: 24 }}>
          The hero element. A vertical card with three regions: <strong style={{ color: "var(--text)" }}>request</strong>, <strong style={{ color: "var(--text)" }}>boundary</strong>, <strong style={{ color: "var(--text)" }}>decision</strong>, then an <strong style={{ color: "var(--text)" }}>audit</strong> footer. Use it to dramatize what verify does.
        </p>
        <div style={{ maxWidth: 480 }}>
          <DecisionPacket decision="denied" />
        </div>

        {/* ── Pipeline ── */}
        <h2 className={s.h2}>Product model pipeline</h2>
        <p className={s.lede} style={{ marginBottom: 24 }}>
          Four-step explainer used in marketing and docs introductions. Always in this order. Numbered <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>01–04</code>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", background: "linear-gradient(90deg, rgba(99,102,241,0.18), transparent 42%, rgba(255,255,255,0.08))" }}>
          {pipelineSteps.map(({ num, title, copy }, i) => (
            <div key={num} style={{ padding: "24px 22px", borderRight: i < 3 ? "1px solid var(--hairline)" : "none", minHeight: 140, display: "grid", alignContent: "space-between", background: "rgba(10,10,10,0.56)" }}>
              <span style={{ color: "var(--muted)", font: "800 0.74rem/1 var(--font-mono)", letterSpacing: "0.1em" }}>{num}</span>
              <strong style={{ color: "var(--text)", font: "700 1.1rem/1.2 var(--font-sans)" }}>{title}</strong>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.86rem", lineHeight: 1.5 }}>{copy}</p>
            </div>
          ))}
        </div>

        {/* ── Hero pattern ── */}
        <h2 className={s.h2}>Marketing hero</h2>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.08fr) minmax(340px, 460px)", gap: "clamp(36px, 6vw, 72px)", alignItems: "center", padding: "56px 32px", border: "1px solid var(--border)", borderRadius: "var(--radius-2xl)", background: "radial-gradient(circle at 78% 8%, rgba(99,102,241,0.16), transparent 24rem), linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.86))", position: "relative", overflow: "hidden" }}>
          <div>
            <p className="ui-kicker">Agent permission infrastructure</p>
            <h2 style={{ margin: "12px 0 0", font: "800 clamp(2.4rem, 5vw, 4rem)/0.92 var(--font-sans)", letterSpacing: "-0.015em" }}>The permission layer between agents and action.</h2>
            <p style={{ margin: "24px 0 0", maxWidth: 520, color: "var(--muted)", fontSize: "1.08rem", lineHeight: 1.6 }}>Define what an agent may do, verify every action before it runs, and fail closed when permission is missing.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 24 }}>
              {["SDK + REST verify","Webhooks & logs","Native + connected"].map((b) => (
                <span key={b} style={{ paddingLeft: 14, color: "rgba(250,250,250,0.78)", fontSize: "0.92rem", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: "0.55em", width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
                  {b}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <button className="ui-button ui-button--primary" style={{ height: 44, padding: "0 20px" }}>Start building</button>
              <button className="ui-button" style={{ height: 44, padding: "0 20px" }}>Run sandbox</button>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 36%), rgba(10,10,10,0.86)", boxShadow: "0 22px 70px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)", color: "var(--muted)", font: "700 0.78rem/1 var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.025)" }}>
              <span>verify · live</span><span>req_3xZ9q</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Action</span>
              <span style={{ color: "var(--text)", font: "600 1.05rem/1.2 var(--font-sans)" }}>purchase</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Amount</span>
              <span style={{ color: "var(--text)", font: "600 0.96rem/1.2 var(--font-mono)" }}>$742.00</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 22px", background: "var(--accent-glow)", borderTop: "1px solid rgba(99,102,241,0.32)", borderBottom: "1px solid rgba(99,102,241,0.32)", color: "var(--accent)", font: "700 0.74rem/1 var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              BehalfID
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "18px 22px" }}>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Decision</span>
              <span style={{ color: "var(--deny)", font: "700 1.6rem/1 var(--font-sans)", letterSpacing: "-0.01em" }}>denied</span>
            </div>
          </div>
        </div>

        {/* ── Action grid ── */}
        <h2 className={s.h2}>Action grid (sandbox pattern)</h2>
        <p className={s.lede} style={{ marginBottom: 12 }}>Used in the sandbox and demo pages to show how the same agent gets different decisions for different actions.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--border)" }}>
          {actions.map(({ type, action, title, copy, vendor, borderColor }, i) => (
            <div key={action} style={{ padding: 22, borderRight: i < 2 ? "1px solid var(--border)" : "none", borderBottom: "1px solid var(--border)", display: "grid", gap: 10, minHeight: 160, alignContent: "start", borderLeft: `2px solid ${borderColor}` }}>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{action}</span>
              <strong style={{ color: "var(--text)", font: "700 1.05rem/1.2 var(--font-sans)" }}>{title}</strong>
              <small style={{ color: "var(--muted)", fontSize: "0.86rem", lineHeight: 1.5 }}>{copy}</small>
              <em style={{ width: "max-content", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", fontSize: "0.74rem", fontStyle: "normal", color: "var(--text)", marginTop: 2 }}>vendor: {vendor}</em>
            </div>
          ))}
        </div>

        {/* ── App shell ── */}
        <h2 className={s.h2}>App shell (console / dashboard / docs)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", minHeight: 360 }}>
          <aside style={{ borderRight: "1px solid var(--border)", padding: "22px 16px", display: "flex", flexDirection: "column", gap: 22, background: "rgba(10,10,10,0.62)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 22, height: 22, background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 8, height: 8, background: "var(--accent)", borderRadius: 2, display: "block" }} />
              </span>
              <span style={{ font: "700 0.9375rem/1 var(--font-sans)", letterSpacing: "-0.02em" }}>Behalf<span style={{ color: "var(--accent)" }}>ID</span></span>
            </div>
            {[
              { label: "Workspace", links: ["Agents", "Permissions", "Logs", "Webhooks"] },
              { label: "Account", links: ["Settings", "API keys", "Sign out"] },
            ].map(({ label, links }) => (
              <div key={label}>
                <div style={{ color: "var(--muted)", font: "800 0.7rem/1 var(--font-sans)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
                <nav style={{ display: "grid", gap: 4 }}>
                  {links.map((link, i) => (
                    <a key={link} href="#" style={{ minHeight: 36, display: "flex", alignItems: "center", padding: "0 11px", borderRadius: "var(--radius-sm)", color: i === 0 && label === "Workspace" ? "var(--text)" : "var(--muted)", textDecoration: "none", fontSize: "0.92rem", background: i === 0 && label === "Workspace" ? "rgba(255,255,255,0.06)" : "none" }}>
                      {link}
                    </a>
                  ))}
                </nav>
              </div>
            ))}
          </aside>
          <main style={{ padding: "28px 32px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <p className="ui-kicker">Workspace</p>
                <h2 style={{ margin: 0, fontSize: "2rem", letterSpacing: "-0.03em", fontWeight: 600 }}>Agents</h2>
              </div>
              <button className="ui-button ui-button--primary">Add agent</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { id: "agent_ollie", sub: "native · 3 permissions", badge: "active", meta: "last 4m" },
                { id: "chat_claude_desktop", sub: "connected · provider claude.ai", badge: "disabled", meta: "paused 1h", muted: true },
              ].map(({ id, sub, badge, meta, muted }) => (
                <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center", padding: "14px 18px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
                  <div>
                    <strong style={{ color: "var(--text)" }}>{id}</strong>
                    <div style={{ color: "var(--muted)", font: "500 0.78rem/1.4 var(--font-mono)", marginTop: 2 }}>{sub}</div>
                  </div>
                  <span className="ui-badge" style={muted ? { color: "var(--muted)", borderColor: "var(--border)" } : undefined}>{badge}</span>
                  <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)" }}>{meta}</span>
                </div>
              ))}
            </div>
          </main>
        </div>

        {/* ── Terminal log ── */}
        <h2 className={s.h2}>Terminal log (audit pattern)</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "rgba(3,7,12,0.74)" }}>
          <div style={{ minHeight: 36, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.035)", color: "var(--muted)", font: "700 0.76rem/1 var(--font-mono)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.18)", boxShadow: "14px 0 0 rgba(255,255,255,0.18), 28px 0 0 rgba(255,255,255,0.18)", marginRight: 22, display: "block", flexShrink: 0 }} />
            verification log · live
          </div>
          <div>
            {logEntries.map(({ time, text, color }, i) => (
              <div key={time} style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, margin: 0, padding: "13px 16px", color: "var(--text)", font: "400 0.86rem/1.5 var(--font-mono)", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 2 }}>{time}</span>
                <span style={{ color }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Do & don't ── */}
        <h2 className={s.h2}>Do &amp; don&apos;t</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderLeft: "2px solid var(--ok)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
            <p className="ui-kicker" style={{ color: "var(--ok)", marginBottom: 12 }}>Do</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", lineHeight: 1.7, fontSize: "0.94rem" }}>
              <li>Make the verify call visible. Show the agent + action + decision together.</li>
              <li>Use one accent color (indigo) and one status color per decision.</li>
              <li>Keep borders 1px. Resist the urge to add elevation to ordinary cards.</li>
              <li>Number explanatory steps <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>01–04</code>; never use icons in their place.</li>
            </ul>
          </div>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderLeft: "2px solid var(--deny)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
            <p className="ui-kicker" style={{ color: "var(--deny)", marginBottom: 12 }}>Don&apos;t</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", lineHeight: 1.7, fontSize: "0.94rem" }}>
              <li>Don&apos;t recolor body cards with gradients. The card is a hairline; the surface is flat.</li>
              <li>Don&apos;t introduce a fourth decision color — three states only.</li>
              <li>Don&apos;t soften the decision word. &ldquo;denied&rdquo; not &ldquo;blocked&rdquo;, not &ldquo;oops&rdquo;.</li>
              <li>Don&apos;t render a fake CTA over the decision packet. Let the moment land.</li>
            </ul>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className={s.foot}>
          <div className={s.footInner}>
            <div>
              <div style={{ color: "var(--text)", font: "600 0.9375rem/1 var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 8 }}>behalfid · design system v1.0</div>
              Pure black canvas. One accent. Hairline everything.<br />
              Maintained by the brand team.
            </div>
            <div className={s.footCols}>
              <div>
                <h5>System</h5>
                <ul>
                  <li><Link href="/design-system/brand">Brand</Link></li>
                  <li><Link href="/design-system/colors">Color</Link></li>
                  <li><Link href="/design-system/typography">Type</Link></li>
                  <li><Link href="/design-system/components">Components</Link></li>
                  <li><Link href="/design-system/patterns">Patterns</Link></li>
                </ul>
              </div>
              <div>
                <h5>Site</h5>
                <ul>
                  <li><Link href="/">Home</Link></li>
                  <li><Link href="/sandbox">Sandbox</Link></li>
                  <li><Link href="/security">Security</Link></li>
                  <li><Link href="/design-system/characteristics">Characteristics</Link></li>
                </ul>
              </div>
              <div>
                <h5>Resources</h5>
                <ul>
                  <li><Link href="/docs/quickstart">Quickstart</Link></li>
                  <li><Link href="/docs/api">API reference</Link></li>
                  <li><Link href="/design-system">DS overview</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
