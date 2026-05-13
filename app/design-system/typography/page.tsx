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

const typeScale = [
  { token: "display", meta: "96px / 0.92 / 800", style: { fontSize: "5rem", lineHeight: 0.92, fontWeight: 800, letterSpacing: "-0.015em" }, sample: "Decision packet" },
  { token: "h1", meta: "64px / 0.96 / 800", style: { fontSize: "4rem", lineHeight: 0.96, fontWeight: 800, letterSpacing: "-0.01em" }, sample: "Permission infrastructure" },
  { token: "h2", meta: "40px / 1.05 / 700", style: { fontSize: "2.5rem", lineHeight: 1.05, fontWeight: 700 }, sample: "Add a decision point before the agent acts." },
  { token: "h3", meta: "22px / 1.2 / 700", style: { fontSize: "1.375rem", lineHeight: 1.2, fontWeight: 700 }, sample: "Add a connected agent" },
  { token: "lede", meta: "17px / 1.65 / 400 · muted", style: { fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--muted)" }, sample: "Manual passports help users share boundaries with assistants that do not integrate yet. Guidance, not enforcement." },
  { token: "body", meta: "15px / 1.6 / 400", style: { fontSize: "0.9375rem", lineHeight: 1.6 }, sample: "Permissions are evaluated server-side. The decision packet returned to the SDK contains the agent ID, the action, the resolved permission, and a stable requestId for the audit log." },
  { token: "label", meta: "14px / 1.4 / 600 · muted", style: { fontSize: "0.875rem", lineHeight: 1.4, color: "var(--muted)", fontWeight: 600 }, sample: "Active permissions" },
  { token: "caption", meta: "13px / 1.45 / 500 · muted", style: { fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--muted)", fontWeight: 500 }, sample: "Last verified · 2026-05-09 18:42 UTC · req_3xZ9q" },
  { token: "kicker", meta: "12px / 1 / 800 · accent · 0.12em", style: {}, isKicker: true, sample: "Agent permission infrastructure" },
  { token: "code", meta: "13px / 1.6 / 400 · mono", style: { fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }, sample: "await behalf.verify({ agentId, action, vendor })" },
];

const weights = [
  { w: 400, label: "400 · regular" },
  { w: 500, label: "500 · medium" },
  { w: 600, label: "600 · semibold" },
  { w: 700, label: "700 · bold" },
  { w: 800, label: "800 · extrabold" },
];

const glyphsInter = ["A","a","g","R","I","D","1","0","—","·","{","}","$","&","?","!"];
const glyphsMono = ["0","O","1","l","{","}","=>","--","$","_",":",";","<",">","/","\\"];

export default function TypographyPage() {
  return (
    <>
      <DSNav current="typography" />

      <div className={s.doc}>

        <p className={s.kicker}>Type</p>
        <h1 className={s.h1}>Inter for everything human. JetBrains Mono for everything literal.</h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          Two families, used decisively. Sans for prose, mono for anything the developer would copy verbatim — code, tokens, agent IDs, decision payloads. Don&apos;t introduce a third typeface for accent. Hierarchy is built from weight and size, not flourish.
        </p>

        {/* ── Specimens ── */}
        <div style={{ paddingTop: 56, borderTop: "1px solid var(--border)", marginTop: 56 }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "baseline" }}>
            <div style={{ color: "var(--muted)", font: "700 0.78rem/1.5 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <strong style={{ display: "block", color: "var(--accent)", fontSize: "0.84rem", marginBottom: 6, letterSpacing: "0.08em" }}>Sans</strong>
              Inter
              <em style={{ display: "block", color: "var(--text)", fontStyle: "normal", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>--font-sans</em>
              <em style={{ display: "block", color: "var(--text)", fontStyle: "normal", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginTop: 4, fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>400 / 500 / 600 / 700 / 800</em>
            </div>
            <div style={{ fontFamily: "var(--font-sans)", color: "var(--text)", fontSize: "6rem", lineHeight: 0.92, letterSpacing: "-0.02em", fontWeight: 800 }}>
              Verify before<br />the agent acts.
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 56, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "baseline" }}>
            <div style={{ color: "var(--muted)", font: "700 0.78rem/1.5 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <strong style={{ display: "block", color: "var(--accent)", fontSize: "0.84rem", marginBottom: 6, letterSpacing: "0.08em" }}>Mono</strong>
              JetBrains Mono
              <em style={{ display: "block", color: "var(--text)", fontStyle: "normal", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>--font-mono</em>
              <em style={{ display: "block", color: "var(--text)", fontStyle: "normal", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginTop: 4, fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>400 / 500 / 600</em>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--text)", fontSize: "1.6rem", lineHeight: 1.45 }}>
              decision = await behalf.verify(&#123;<br />
              &nbsp;&nbsp;agentId: <span style={{ color: "#86efac" }}>&quot;agent_ollie&quot;</span>,<br />
              &nbsp;&nbsp;action:&nbsp; <span style={{ color: "#86efac" }}>&quot;purchase&quot;</span>,<br />
              &nbsp;&nbsp;amount:&nbsp; <span style={{ color: "#c4b5fd" }}>742</span><br />
              &#125;);
            </div>
          </div>
        </div>

        {/* ── Type scale ── */}
        <h2 className={s.h2}>Type scale</h2>
        <div>
          {typeScale.map(({ token, meta, style, isKicker, sample }) => (
            <div key={token} style={{ padding: "18px 0", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "90px 130px 1fr", gap: 24, alignItems: "baseline" }}>
              <span style={{ color: "var(--accent)", font: "600 0.82rem/1 var(--font-mono)" }}>{token}</span>
              <span style={{ color: "var(--muted)", font: "500 0.78rem/1 var(--font-mono)" }}>{meta}</span>
              {isKicker ? (
                <p className="ui-kicker" style={{ margin: 0 }}>{sample}</p>
              ) : (
                <span style={{ color: "var(--text)", ...style }}>{sample}</span>
              )}
            </div>
          ))}
        </div>

        {/* ── Weights ── */}
        <h2 className={s.h2}>Weights — Inter</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {weights.map(({ w, label }, i) => (
            <div key={w} style={{ padding: "24px 16px", borderRight: i < weights.length - 1 ? "1px solid var(--border)" : "none", display: "grid", gap: 8 }}>
              <span style={{ color: "var(--text)", fontSize: "1.7rem", lineHeight: 1, letterSpacing: "-0.01em", fontWeight: w }}>Aa</span>
              <span style={{ color: "var(--muted)", font: "600 0.74rem/1 var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: "0.92rem" }}>Display headings use 800. Body copy is 400. Buttons and labels are 500–600. Avoid 100–300 — they get fragile on dark backgrounds.</p>

        {/* ── Pairing ── */}
        <h2 className={s.h2}>Pairing — when sans, when mono</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24 }}>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }}>
            <em style={{ fontStyle: "normal", color: "var(--muted)", font: "700 0.74rem/1 var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>Use Inter</em>
            <p style={{ margin: "0 0 12px", color: "var(--text)", lineHeight: 1.6 }}>Headings, prose, button labels, kicker eyebrows, table headers, decision verbs in marketing copy.</p>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>Anything a designer would adjust without breaking the product.</p>
          </div>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }}>
            <em style={{ fontStyle: "normal", color: "var(--muted)", font: "700 0.74rem/1 var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>Use JetBrains Mono</em>
            <p style={{ margin: "0 0 12px", color: "var(--text)", lineHeight: 1.6, fontFamily: "var(--font-mono)" }}>agent_ollie · req_3xZ9q · purchase · 742</p>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>Anything a developer would copy character-for-character: tokens, agent IDs, request IDs, JSON keys, code, decision payloads, file paths.</p>
          </div>
        </div>

        {/* ── Glyph plates ── */}
        <h2 className={s.h2}>Glyph plate — Inter</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {glyphsInter.map((g, i) => (
            <div key={i} style={{ aspectRatio: "1", display: "grid", placeItems: "center", borderRight: (i + 1) % 8 !== 0 ? "1px solid var(--border)" : "none", borderBottom: i < 8 ? "1px solid var(--border)" : "none", color: "var(--text)", fontFamily: "var(--font-sans)", fontSize: "1.4rem" }}>
              {g}
            </div>
          ))}
        </div>

        <h3 className={s.h3} style={{ marginTop: 28 }}>Glyph plate — JetBrains Mono</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {glyphsMono.map((g, i) => (
            <div key={i} style={{ aspectRatio: "1", display: "grid", placeItems: "center", borderRight: (i + 1) % 8 !== 0 ? "1px solid var(--border)" : "none", borderBottom: i < 8 ? "1px solid var(--border)" : "none", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "1.4rem" }}>
              {g}
            </div>
          ))}
        </div>

        {/* ── Rules of thumb ── */}
        <h2 className={s.h2}>Rules of thumb</h2>
        <ul style={{ color: "var(--muted)", lineHeight: 1.85, paddingLeft: 22, maxWidth: 760 }}>
          <li>Headings get tighter as they grow. <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>letter-spacing: -0.01em</code> at 32px+, <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>-0.015em</code> at 64px+.</li>
          <li>Body line-height is <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>1.6</code>. Lede line-height is <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>1.65</code>. Headings are <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>0.92–1.1</code>.</li>
          <li>Max measure for prose is <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>720–760px</code>. Anything wider is hard to read on a wide monitor.</li>
          <li>Don&apos;t bold inside body for emphasis — use <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--text</code> against <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--muted</code>. Color is the emphasis.</li>
          <li>Never set body smaller than 14px. Console table cells may go to 13px.</li>
        </ul>

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
