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

export default function CharacteristicsPage() {
  return (
    <>
      <DSNav current="characteristics" />

      <div className={s.doc}>

        {/* ── Hero ── */}
        <p className={s.kicker}>Characteristics</p>
        <h1 className={s.h1}>The look, made <em style={{ fontStyle: "normal", color: "var(--text-2)" }}>explicit.</em></h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          Four principles, the foundation tokens you&apos;ll use every day, and applied site examples that
          show the system in production. If you can read this page, you can ship in the system.
        </p>

        {/* ── Principles ── */}
        <h2 className={s.h2} style={{ marginTop: 72 }}>
          <span style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", display: "block", marginBottom: 8 }}>01 — Principles</span>
          Four rules for every surface.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
          {[
            {
              num: "001",
              title: "Fail closed.",
              copy: "If the answer isn't yes, the action doesn't run. The brand reflects this. No marketing maybes, no animated reassurances, no 'could', 'might', 'will eventually'. A denial is the headline, not a footnote.",
              rule: "denials use the deny color, no qualifying copy, and appear above their reason.",
            },
            {
              num: "002",
              title: "Show the boundary.",
              copy: "Every layout makes the decision moment legible. Render the verify call where you can, name the boundary explicitly, and place the decision next to the request that triggered it. The boundary is the brand asset.",
              rule: 'the indigo divider strip ("behalfid · decision boundary") is the only branded element repeated across surfaces.',
            },
            {
              num: "003",
              title: "One color is enough.",
              copy: "Indigo for the brand. Status colors only when a decision must be read at a glance. Everything else is greyscale. Color is information, not decoration. A reader on a phone in sunlight should still be able to tell allowed from denied.",
              rule: "never use indigo for status, never use status colors for emphasis, and never introduce a fifth hue.",
            },
            {
              num: "004",
              title: "Truth, not theater.",
              copy: '"Preview", "planned", "MVP", "best-effort" appear in marketing because they appear in the product. The system favors honest words over confident ones. If a feature is half-built, that fact is written in the same type as the headline.',
              rule: "stage labels (preview, planned, MVP, manual guidance) get the standard badge, not a custom callout.",
            },
          ].map(({ num, title, copy, rule }, i) => (
            <div
              key={num}
              style={{
                padding: "36px 32px",
                borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                borderTop: i < 2 ? "none" : "1px solid var(--border)",
                minHeight: 240,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", marginBottom: 16 }}>{num}</div>
              <div style={{ color: "var(--text)", font: "600 1.5rem/1.15 var(--font-sans)", letterSpacing: "-0.025em", marginBottom: 14, maxWidth: "22ch" }}>{title}</div>
              <div style={{ color: "var(--text-2)", fontSize: "0.9375rem", lineHeight: 1.6, maxWidth: "52ch" }}>{copy}</div>
              <div style={{ marginTop: "auto", paddingTop: 22, color: "var(--muted)", font: "500 0.78rem/1.5 var(--font-mono)" }}>
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>In practice —</strong> {rule}
              </div>
            </div>
          ))}
        </div>

        {/* ── Foundations ── */}
        <h2 className={s.h2}>
          <span style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", display: "block", marginBottom: 8 }}>02 — Foundations</span>
          Tokens you&apos;ll use every day.
          <Link href="/design-system/colors" style={{ marginLeft: 16, font: "500 0.78rem/1 var(--font-sans)", color: "var(--text-2)", verticalAlign: "middle" }}>All tokens →</Link>
        </h2>

        {[
          {
            category: "Surface", subtitle: "Background & ink",
            rows: [
              { label: "canvas", token: "--bg", chip: "#000000", demo: "#000000 — pure black, the only page background" },
              { label: "panel", token: "--panel", chip: "#0a0a0a", demo: "#0a0a0a — code shells, sidebars, the logo mark" },
              { label: "text", token: "--text", chip: "#fafafa", demo: "#fafafa — primary type. Never #fff." },
              { label: "muted", token: "--muted", chip: "#707070", demo: "#707070 — captions, labels, hairline metadata" },
              { label: "border", token: "--border", chip: "rgba(255,255,255,0.08)", demo: "rgba(255,255,255,0.08) — every divider on the site" },
            ],
          },
          {
            category: "Type", subtitle: "Two families",
            rows: [
              { label: "sans", token: "--font-sans", chip: null, demo: "Inter — prose, headings, labels", demoStyle: { font: "600 1.4rem/1 var(--font-sans)", letterSpacing: "-0.025em", color: "var(--text)" } },
              { label: "mono", token: "--font-mono", chip: null, demo: "JetBrains Mono — IDs, tokens, code", demoStyle: { font: "500 1rem/1 var(--font-mono)", color: "var(--text)" } },
            ],
          },
          {
            category: "Decision", subtitle: "Status palette",
            rows: [
              { label: "allow", token: "--ok", chip: "#6ee7b7", demo: null, demoBadge: { text: "allowed", cls: "allow" }, demoText: "agent_ollie · access_data · gmail.com" },
              { label: "deny", token: "--deny", chip: "#fca5a5", demo: null, demoBadge: { text: "denied", cls: "deny" }, demoText: "agent_ollie · purchase · coachella.com" },
              { label: "warn", token: "--warn", chip: "#fcd34d", demo: null, demoBadge: { text: "needs approval", cls: "warn" }, demoText: "agent_ollie · send_email · 38 recipients" },
            ],
          },
          {
            category: "Brand", subtitle: "One accent",
            rows: [
              { label: "accent", token: "--accent", chip: "#6366F1", demo: "#6366F1 — only on the boundary divider, focus rings, and selection." },
              { label: "accent-glow", token: "--accent-glow", chip: "rgba(99,102,241,0.18)", demo: "rgba(99,102,241,0.18) — fill behind the boundary divider strip." },
            ],
          },
        ].map(({ category, subtitle, rows }) => (
          <div key={category} style={{ display: "grid", gridTemplateColumns: "240px 1fr", borderBottom: "1px solid var(--border)" }}>
            <div style={{ padding: 28, borderRight: "1px solid var(--border)", color: "var(--muted)", font: "500 0.75rem/1 var(--font-mono)" }}>
              {category}
              <strong style={{ display: "block", color: "var(--text)", font: "600 1rem/1.2 var(--font-sans)", letterSpacing: "-0.02em", marginTop: 10 }}>{subtitle}</strong>
            </div>
            <div>
              {rows.map((row: {
                label: string;
                token: string;
                chip?: string | null;
                demo?: string | null;
                demoStyle?: React.CSSProperties;
                demoBadge?: { text: string; cls: string } | null;
                demoText?: string;
              }) => (
                <div key={row.label} style={{ display: "grid", gridTemplateColumns: "200px 220px 1fr", alignItems: "center", padding: "18px 28px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)" }}>{row.label}</span>
                  <span style={{ color: "var(--text)", font: "500 0.875rem/1 var(--font-mono)" }}>
                    {row.chip && (
                      <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, verticalAlign: "-3px", marginRight: 10, background: row.chip, border: "1px solid rgba(255,255,255,0.08)" }} />
                    )}
                    {row.token}
                  </span>
                  <span style={{ color: "var(--text-2)", fontSize: "0.875rem", ...(row.demoStyle || {}) }}>
                    {row.demoBadge ? (
                      <>
                        <span className={`ui-badge ui-badge--${row.demoBadge.cls}`}>{row.demoBadge.text}</span>
                        {" "}&nbsp;{row.demoText}
                      </>
                    ) : row.demo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── Applied examples ── */}
        <h2 className={s.h2}>
          <span style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", display: "block", marginBottom: 8 }}>03 — Applied</span>
          Site examples. <em style={{ fontStyle: "normal", color: "var(--text-2)", fontWeight: 500 }}>The system, deployed.</em>
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {[
            {
              href: "/",
              num: "— Site / Home",
              title: "Homepage",
              copy: "Hero, decision packet, four-step model, developer enforcement, secondary surfaces.",
              label: "/",
            },
            {
              href: "/sandbox",
              num: "— Site / Sandbox",
              title: "Sandbox",
              copy: "Interactive enforcement demo. Switch the simulated request, watch the trace fire.",
              label: "/sandbox",
            },
            {
              href: "/security",
              num: "— Site / Security",
              title: "Security",
              copy: "Long-form content surface. Numbered sections, fail-closed code, honest limitations.",
              label: "/security",
            },
          ].map(({ href, num, title, copy, label }, i) => (
            <Link
              key={href}
              href={href}
              style={{
                borderRight: i < 2 ? "1px solid var(--border)" : "none",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                textDecoration: "none",
              }}
            >
              <div style={{ padding: "22px 24px 16px" }}>
                <span style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", marginBottom: 10, display: "block" }}>{num}</span>
                <div style={{ color: "var(--text)", font: "600 1.125rem/1.2 var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 6 }}>{title}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.5 }}>{copy}</div>
              </div>
              <div style={{ margin: "0 24px 22px", paddingTop: 16, borderTop: "1px solid var(--border)", marginTop: "auto", color: "var(--text-2)", font: "500 0.78rem/1 var(--font-mono)", display: "flex", justifyContent: "space-between" }}>
                <span>{label}</span><span style={{ color: "var(--text)" }}>↗</span>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Implementation ── */}
        <h2 className={s.h2}>
          <span style={{ color: "var(--muted)", font: "500 0.72rem/1 var(--font-mono)", display: "block", marginBottom: 8 }}>04 — Implementation</span>
          Compose with tokens, <em style={{ fontStyle: "normal", color: "var(--text-2)", fontWeight: 500 }}>never raw values.</em>
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: 28, borderRight: "1px solid var(--border)" }}>
            <h3 style={{ font: "600 1rem/1.2 var(--font-sans)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>New page in 8 lines</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.5, margin: 0 }}>Import tokens, primitives, and (for marketing surfaces) site chrome. Stack everything else on top. The system gives you ~80% of the surface for free.</p>
          </div>
          <div style={{ padding: 28 }}>
            <div className="ui-code-shell">
              <div className="ui-code-bar">
                <span>page.tsx</span>
                <span>tsx · globals.css</span>
              </div>
              <pre style={{ margin: 0, padding: "16px 20px", fontSize: "0.8125rem", lineHeight: 1.6, overflowX: "auto" }}>
{`import s from "./page.module.css";

// tokens come from globals.css — no imports needed
// use var(--bg), var(--accent), var(--font-mono) etc.

export default function Page() {
  return (
    <main>
      <p className="ui-kicker">Permission infrastructure</p>
      <h1>Verify before the agent acts.</h1>
      <a className="ui-button ui-button--primary">Start building</a>
    </main>
  );
}`}
              </pre>
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
