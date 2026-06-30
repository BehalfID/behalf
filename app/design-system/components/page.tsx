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

const Demo = ({ children, col, grid }: { children: React.ReactNode; col?: boolean; grid?: boolean }) => (
  <div style={{
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 32,
    background: "var(--surface)",
    display: grid ? "grid" : "flex",
    flexWrap: "wrap" as const,
    gridTemplateColumns: grid ? "1fr 1fr" : undefined,
    gap: grid ? 16 : 12,
    alignItems: grid ? "stretch" : "center",
    flexDirection: col ? "column" : undefined,
    minHeight: 100,
  }}>
    {children}
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, padding: "18px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
    <span style={{ color: "var(--muted)", font: "500 0.85rem/1.4 var(--font-mono)" }}>{label}</span>
    <div>{children}</div>
  </div>
);

export default function ComponentsPage() {
  return (
    <>
      <DSNav current="components" />

      <div className={s.doc}>

        <p className={s.kicker}>Components</p>
        <h1 className={s.h1}>Primitives that match the production UI.</h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          These are the building blocks shipped in <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>components/ui/*</code>. Class names in the live app use <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>ui-button</code>, <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>ui-card</code>, <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>ui-badge</code> — same tokens, same behavior.
        </p>

        {/* ── Buttons ── */}
        <h2 className={s.h2}>Buttons</h2>
        <Row label="Variants">
          <Demo>
            <button className="ui-button ui-button--primary">Start building</button>
            <button className="ui-button">Read quickstart</button>
            <button className="ui-button" style={{ color: "var(--text-2)", background: "transparent", borderColor: "transparent" }}>Cancel</button>
            <button className="ui-button" style={{ color: "var(--deny)", borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>Revoke key</button>
          </Demo>
        </Row>
        <Row label="Sizes">
          <Demo>
            <button className="ui-button" style={{ height: 28, padding: "0 10px", fontSize: "0.8125rem" }}>Small</button>
            <button className="ui-button">Default</button>
            <button className="ui-button" style={{ height: 44, padding: "0 20px", fontSize: "1rem" }}>Large</button>
          </Demo>
        </Row>
        <Row label="States">
          <Demo>
            <button className="ui-button ui-button--primary">Default</button>
            <button className="ui-button ui-button--primary" style={{ background: "var(--accent)", transform: "translateY(-1px)" }}>Hover</button>
            <button className="ui-button ui-button--primary" disabled>Disabled</button>
          </Demo>
        </Row>

        {/* ── Inputs ── */}
        <h2 className={s.h2}>Inputs</h2>
        <Row label="Text + label">
          <Demo col>
            <label className="ui-field-label" style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 0.875rem/1 var(--font-sans)", color: "var(--text)" }}>
              Agent label
              <input className="ui-input" type="text" defaultValue="agent_ollie" />
            </label>
            <label className="ui-field-label" style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 0.875rem/1 var(--font-sans)", color: "var(--text)" }}>
              Action
              <select className="ui-input" style={{ height: 38 }}>
                <option>purchase</option>
                <option>send_email</option>
                <option>access_data</option>
              </select>
            </label>
            <label className="ui-field-label" style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 0.875rem/1 var(--font-sans)", color: "var(--text)" }}>
              Notes
              <textarea className="ui-input" placeholder="Optional context for the audit log…" rows={3} />
            </label>
          </Demo>
        </Row>

        {/* ── Badges ── */}
        <h2 className={s.h2}>Badges &amp; status</h2>
        <Row label="Decision">
          <Demo>
            <span className="ui-badge ui-badge--allow">allowed</span>
            <span className="ui-badge ui-badge--deny">denied</span>
            <span className="ui-badge ui-badge--warn">needs approval</span>
          </Demo>
        </Row>
        <Row label="Lifecycle">
          <Demo>
            <span className="ui-badge">active</span>
            <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>disabled</span>
            <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>revoked</span>
            <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>expired</span>
            <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>pending</span>
          </Demo>
        </Row>

        {/* ── Cards ── */}
        <h2 className={s.h2}>Cards</h2>
        <Demo grid>
          <div className="ui-card" style={{ padding: 24 }}>
            <p className="ui-kicker" style={{ marginBottom: 10 }}>Native agent</p>
            <h3 style={{ margin: 0, color: "var(--text)", fontSize: "1.2rem", fontWeight: 600 }}>agent_ollie</h3>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>3 active permissions · last verified 4m ago.</p>
          </div>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)" }}>Verifications · 24h</span>
            <strong style={{ color: "var(--text)", font: "700 2rem/1 var(--font-sans)", letterSpacing: "-0.03em" }}>1,284</strong>
          </div>
          <div className="ui-card" style={{ padding: 24, border: "1px solid var(--border-strong)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.84rem" }}>Default card with elevation. Use only on hero panels and dialogs.</p>
          </div>
          <div style={{ padding: 24, border: "1px solid rgba(216, 138, 99,0.4)", borderRadius: "var(--radius-md)", background: "var(--accent-soft)" }}>
            <p style={{ margin: 0, color: "var(--text)", fontSize: "0.94rem", lineHeight: 1.5 }}><strong>Heads up.</strong> Action Gateway currently supports safe public web reads as the MVP.</p>
          </div>
        </Demo>

        {/* ── Code block ── */}
        <h2 className={s.h2}>Code block</h2>
        <div className="ui-code-shell">
          <div className="ui-code-bar">
            <span>install + verify</span>
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>js</span>
          </div>
          <pre style={{ margin: 0, padding: "16px 20px", fontSize: "0.8125rem", lineHeight: 1.6, overflowX: "auto" }}>
{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY
});

const decision = await behalf.verify({
  agentId: "agent_ollie",
  action:  "purchase",
  vendor:  "coachella.com",
  amount:  742
});

// fail closed
if (!decision.allowed) {
  throw new Error(decision.reason);
}`}
          </pre>
        </div>

        {/* ── Table ── */}
        <h2 className={s.h2}>Table</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
            <thead>
              <tr>
                {["Action","Vendor","Decision","Request","When"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 14px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.025)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { action: "purchase", vendor: "coachella.com", decision: "deny", req: "req_3xZ9q", when: "2026-05-09 18:42" },
                { action: "access_data", vendor: "gmail.com", decision: "allow", req: "req_3xZ9p", when: "2026-05-09 18:39" },
                { action: "send_email", vendor: "gmail.com", decision: "warn", req: "req_3xZ9o", when: "2026-05-09 18:36" },
                { action: "access_data", vendor: "notion.so", decision: "allow", req: "req_3xZ9n", when: "2026-05-09 18:31" },
              ].map((row, i, arr) => (
                <tr key={row.req}>
                  <td style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", color: "var(--text)" }}>{row.action}</td>
                  <td style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", color: "var(--text)" }}>{row.vendor}</td>
                  <td style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span className={`ui-badge ui-badge--${row.decision}`}>{row.decision === "allow" ? "allowed" : row.decision === "deny" ? "denied" : "needs approval"}</span>
                  </td>
                  <td style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.86rem" }}>{row.req}</td>
                  <td style={{ padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.86rem" }}>{row.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── List row ── */}
        <h2 className={s.h2}>List row (console pattern)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { id: "agent_ollie", type: "native", perms: "3 permissions · created 2026-04-21", status: "active", meta: "last verified 4m" },
            { id: "chat_claude_desktop", type: "connected · provider claude.ai", perms: "1 permission", status: "disabled", meta: "paused 1h ago" },
            { id: "zapier_homebrew", type: "connected · provider zapier", perms: "7 permissions", status: "active", meta: "last verified 12s" },
          ].map(({ id, type, perms, status, meta }) => (
            <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center", padding: "14px 18px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
              <div>
                <strong style={{ color: "var(--text)", fontWeight: 600 }}>{id}</strong>
                <small style={{ color: "var(--muted)", font: "500 0.78rem/1.4 var(--font-mono)", display: "block", marginTop: 2 }}>{type} · {perms}</small>
              </div>
              <span className={`ui-badge${status === "disabled" ? "" : ""}`} style={status === "disabled" ? { color: "var(--muted)", borderColor: "var(--border)" } : undefined}>{status}</span>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)" }}>{meta}</span>
              <button className="ui-button" style={{ height: 28, padding: "0 10px", fontSize: "0.8125rem" }}>Open</button>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <h2 className={s.h2}>Tabs</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, background: "var(--surface)" }}>
          <nav style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {["Overview","Permissions","Logs","Webhooks","Settings"].map((tab, i) => (
              <a key={tab} href="#" style={{ padding: "12px 16px", color: i === 0 ? "var(--text)" : "var(--muted)", textDecoration: "none", font: "600 0.92rem/1 var(--font-sans)", borderBottom: i === 0 ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>
                {tab}
              </a>
            ))}
          </nav>
        </div>

        {/* ── Empty state ── */}
        <h2 className={s.h2}>Empty state</h2>
        <div style={{ minHeight: 200, display: "grid", placeItems: "center", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-lg)", padding: 32, background: "var(--surface-soft)" }}>
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <strong style={{ display: "block", color: "var(--text)", fontSize: "1.05rem", marginBottom: 6 }}>No verifications yet.</strong>
            <p style={{ color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.55, fontSize: "0.92rem" }}>
              Once an agent calls <code style={{ color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.86rem" }}>behalf.verify(…)</code> with this key, decisions appear here.
            </p>
            <button className="ui-button ui-button--primary" style={{ height: 28, padding: "0 10px", fontSize: "0.8125rem" }}>Copy API key</button>
          </div>
        </div>

        {/* ── Page header ── */}
        <h2 className={s.h2}>Page header</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
            <div>
              <p className="ui-kicker">Native agent</p>
              <h1 style={{ margin: 0, fontSize: "3rem", lineHeight: 1, letterSpacing: "-0.01em", color: "var(--text)", fontWeight: 800 }}>agent_ollie</h1>
              <p style={{ margin: "14px 0 0", color: "var(--muted)", lineHeight: 1.6, maxWidth: 540 }}>Custom integration created on 2026-04-21. Currently allows purchase up to $500 on coachella.com and access_data on gmail.com.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ui-button">Rotate key</button>
              <button className="ui-button ui-button--primary">Add permission</button>
            </div>
          </div>
        </div>

        {/* ── Form ── */}
        <h2 className={s.h2}>Form (signup pattern)</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, background: "var(--surface)" }}>
          <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 0.875rem/1 var(--font-sans)", color: "var(--text)" }}>
              Email
              <input className="ui-input" type="email" defaultValue="dev@studio.co" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 0.875rem/1 var(--font-sans)", color: "var(--text)" }}>
              Password
              <input className="ui-input" type="password" defaultValue="••••••••••" />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8 }}>
              <button className="ui-button ui-button--primary">Create account</button>
              <a href="#" style={{ color: "var(--muted)", fontSize: "0.92rem" }}>Already have one? Sign in</a>
            </div>
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
