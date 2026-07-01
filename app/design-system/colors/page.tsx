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

interface SwatchDef {
  bg: string;
  token: string;
  name: string;
  hex: string;
  role: string;
}

function SwatchGrid({ swatches }: { swatches: SwatchDef[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${swatches.length}, 1fr)`, borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      {swatches.map(({ bg, token, name, hex, role }, i) => (
        <div key={token} style={{ padding: "18px 20px 22px", borderRight: i < swatches.length - 1 ? "1px solid var(--border)" : "none", display: "grid", gap: 8, minHeight: 220 }}>
          <div style={{ width: "100%", height: 96, borderRadius: "var(--radius-md)", border: "1px solid rgba(255,255,255,0.06)", background: bg }} />
          <span style={{ color: "var(--accent)", font: "600 0.82rem/1 var(--font-mono)" }}>{token}</span>
          <span style={{ color: "var(--text)", font: "700 0.95rem/1.2 var(--font-sans)" }}>{name}</span>
          <span style={{ color: "var(--muted)", font: "500 0.78rem/1.4 var(--font-mono)" }}>{hex}</span>
          <span style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.45, marginTop: 4 }}>{role}</span>
        </div>
      ))}
    </div>
  );
}

const matrixRows = [
  { chip: "#000000", token: "--bg", use: "Page canvas. Empty space.", dontUse: "Card fills.", pairs: "--text, --muted" },
  { chip: "#0a0a0a", token: "--panel", use: "Code shells. Sidebar. Logo mark.", dontUse: "Hero backgrounds.", pairs: "--text, --accent" },
  { chip: "#D88A63", token: "--accent", use: 'Primary buttons, kickers, "ID" wordmark.', dontUse: "Body backgrounds. Decorative gradients.", pairs: "--on-brand text on top." },
  { chip: "#6ee7b7", token: "--ok", use: '"allowed" word + chip border.', dontUse: "General success toasts.", pairs: "--ok-bg, --ok-border" },
  { chip: "#fca5a5", token: "--deny", use: '"denied" word + chip border.', dontUse: "Form validation errors.", pairs: "--deny-bg, --deny-border" },
  { chip: "#fcd34d", token: "--warn", use: '"needs approval" word + chip border.', dontUse: "Warnings, cautions, deprecation banners.", pairs: "--warn-bg, --warn-border" },
];

export default function ColorsPage() {
  return (
    <>
      <DSNav current="colors" />

      <div className={s.doc}>

        <p className={s.kicker}>Colors</p>
        <h1 className={s.h1}>One accent. Three statuses. Everything else is grayscale.</h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          BehalfID is a permission product. Color carries meaning: copper is the brand accent; status colors only appear when a decision must be read at a glance. Avoid recoloring the UI to liven it up — restraint is the brand.
        </p>

        {/* ── Surfaces ── */}
        <h2 className={s.h2}>Surfaces</h2>
        <SwatchGrid swatches={[
          { bg: "#000000", token: "--bg", name: "Canvas", hex: "#000000", role: "Page background. The lowest layer." },
          { bg: "#0a0a0a", token: "--panel", name: "Panel", hex: "#0a0a0a", role: "Solid surface — code blocks, logo mark, sidebar." },
          { bg: "rgba(10,10,10,0.82)", token: "--surface", name: "Surface", hex: "rgba(10,10,10,.82)", role: "Default card. Translucent so radial glows show through." },
          { bg: "rgba(5,5,5,0.54)", token: "--surface-soft", name: "Soft surface", hex: "rgba(5,5,5,.54)", role: "Empty states, secondary panels, console rows." },
        ]} />

        {/* ── Ink ── */}
        <h2 className={s.h2}>Ink</h2>
        <SwatchGrid swatches={[
          { bg: "#fafafa", token: "--text", name: "Text", hex: "#fafafa", role: "Primary type. Headings, body, decision values." },
          { bg: "#707070", token: "--muted", name: "Muted", hex: "#707070", role: "Captions, labels, kicker descriptions, sidebar links." },
          { bg: "rgba(255,255,255,0.08)", token: "--border", name: "Border", hex: "rgba(255,255,255,.08)", role: "Default 1px hairline. Used for almost every divider." },
          { bg: "rgba(255,255,255,0.16)", token: "--border-strong", name: "Border strong", hex: "rgba(255,255,255,.16)", role: "Buttons, badges, form-control idle borders." },
        ]} />

        {/* ── Brand accent ── */}
        <h2 className={s.h2}>Brand accent</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          <div style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "#D88A63", display: "grid", gap: 8 }}>
            <small style={{ color: "rgba(23,20,18,0.72)", font: "700 0.7rem/1 var(--font-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}>--accent · #D88A63</small>
            <strong style={{ color: "#171412", font: "700 1.4rem/1.2 var(--font-sans)" }}>Copper is the only brand color.</strong>
            <span style={{ color: "rgba(23,20,18,0.72)", fontSize: "0.9rem", lineHeight: 1.5 }}>Used on primary buttons, kicker eyebrows, and the &ldquo;ID&rdquo; of the wordmark. Status pills keep their own semantic colors. Never a fill on body cards.</span>
          </div>
          <div style={{ padding: 24, border: "1px solid rgba(216, 138, 99,0.5)", borderRadius: "var(--radius-lg)", background: "rgba(216, 138, 99,0.16)", display: "grid", gap: 8 }}>
            <small style={{ color: "var(--muted)", font: "700 0.7rem/1 var(--font-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}>--accent-glow · rgba(216, 138, 99,.16)</small>
            <strong style={{ color: "var(--text)", font: "700 1.4rem/1.2 var(--font-sans)" }}>Glow tint</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Background for allowed pills, focus rings, and selection. Borders use 0.45–0.5 alpha.</span>
          </div>
        </div>

        <h3 className={s.h3} style={{ marginTop: 32 }}>Copper ramp (use only the named tokens — ramp shown for reference)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {[
            { bg: "#3D241A", label: "900" },
            { bg: "#5C3625", label: "800" },
            { bg: "#7A4731", label: "700" },
            { bg: "#A85A37", label: "600" },
            { bg: "#D88A63", label: "500" },
            { bg: "#E2A488", label: "400", dark: true },
            { bg: "#EFC4AF", label: "300", dark: true },
            { bg: "#F7D7C6", label: "200", dark: true },
          ].map(({ bg, label, dark }) => (
            <div key={label} style={{ aspectRatio: "1.1", display: "flex", alignItems: "flex-end", padding: 10, font: "600 0.7rem/1 var(--font-mono)", color: dark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.85)", background: bg }}>
              {label}
            </div>
          ))}
        </div>

        {/* ── Status ── */}
        <h2 className={s.h2}>Status</h2>
        <p className={s.lede}>Status colors carry a specific decision. Use them on borders and chip backgrounds; reserve the bright text variant for the decision word itself.</p>
        <SwatchGrid swatches={[
          { bg: "#6ee7b7", token: "--ok", name: "Allowed", hex: "#6ee7b7", role: "Decision = allowed. Border #22c55e at 32% alpha." },
          { bg: "#fca5a5", token: "--deny", name: "Denied", hex: "#fca5a5", role: "Decision = denied. Border #ef4444 at 30% alpha." },
          { bg: "#fcd34d", token: "--warn", name: "Needs approval", hex: "#fcd34d", role: "Decision = needs_approval. Border #eab308 at 34% alpha." },
          { bg: "#D88A63", token: "--accent", name: "Active / brand", hex: "#D88A63", role: "Active state, primary CTA, \"ID\" wordmark accent." },
        ]} />

        <h3 className={s.h3} style={{ marginTop: 28 }}>Status pills in context</h3>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <span className="ui-badge ui-badge--allow">allowed</span>
          <span className="ui-badge ui-badge--deny">denied</span>
          <span className="ui-badge ui-badge--warn">needs approval</span>
          <span className="ui-badge">active</span>
          <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>disabled</span>
          <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>revoked</span>
          <span className="ui-badge" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>expired</span>
        </div>

        {/* ── Usage matrix ── */}
        <h2 className={s.h2}>Usage matrix</h2>
        <div style={{ display: "grid", gridTemplateColumns: "220px repeat(3, 1fr)", borderTop: "1px solid var(--border)" }}>
          {["Token", "Use for", "Don't use for", "Pairs with"].map((h) => (
            <div key={h} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", color: "var(--muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", background: "rgba(255,255,255,0.025)" }}>{h}</div>
          ))}
          {matrixRows.map(({ chip, token, use, dontUse, pairs }) => (
            <>
              <div key={`${token}-token`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: "0.92rem" }}>
                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, verticalAlign: "middle", marginRight: 8, background: chip, border: "1px solid rgba(255,255,255,0.1)" }} />
                <code style={{ color: "var(--accent)", fontSize: "0.84rem", fontFamily: "var(--font-mono)" }}>{token}</code>
              </div>
              <div key={`${token}-use`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: "0.92rem", color: "var(--text)" }}>{use}</div>
              <div key={`${token}-dont`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: "0.92rem", color: "var(--text)" }}>{dontUse}</div>
              <div key={`${token}-pairs`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: "0.92rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{pairs}</div>
            </>
          ))}
        </div>

        {/* ── Accessibility ── */}
        <h2 className={s.h2}>Accessibility</h2>
        <p className={s.lede}>
          Test contrast against <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--bg</code> and <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--panel</code>. Body text on canvas is{" "}
          <strong style={{ color: "var(--text)" }}>14.7:1</strong> — well above WCAG AAA. Muted text is{" "}
          <strong style={{ color: "var(--text)" }}>5.9:1</strong> — AA for body, AAA for large. Don&apos;t use{" "}
          <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--muted</code> on{" "}
          <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>--surface-soft</code> for body copy without bumping size.
        </p>

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
