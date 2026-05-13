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

const principles = [
  { num: "01", title: "Fail closed.", body: "If the answer isn't yes, the action doesn't run. The brand reflects this: no soft suggestions, no marketing maybes." },
  { num: "02", title: "Show the boundary.", body: "Every layout makes the decision moment visible. Where possible, render the verify call, the decision, and the audit event." },
  { num: "03", title: "One color is enough.", body: "Indigo for the brand, status colors only when a decision must be read. Everything else is grayscale." },
  { num: "04", title: "Truth, not theater.", body: 'Don\'t draw confidence we haven\'t shipped. Site Guard says "preview" because it\'s a preview. Action Gateway says "MVP" because it is one.' },
  { num: "05", title: "Developer-readable.", body: "Pages, ads, and the console all sit comfortably next to the SDK call. JSON, code, and prose share the same monospace and cadence." },
  { num: "06", title: "Structural, not skeuomorphic.", body: "Hairlines and grids do the work that gradients and shadows would do elsewhere. Borders are 1px. Type does the heavy lifting." },
];

const glossary = [
  { term: "passport", def: "The set of permissions attached to one agent. Plural is OK (\"passport links\"). Never \"credentials.\"" },
  { term: "permission", def: 'One rule. Has action, resource/vendor, optional amount, optional expiry. Never "policy" or "scope."' },
  { term: "verify", def: "The act of asking BehalfID whether a specific action is allowed. Never \"authorize\" — authorization is what calling code does after." },
  { term: "decision", def: "The result of verify: allowed, denied, or needs_approval. Never \"response\" in user-facing copy." },
  { term: "fail closed", def: "If verify fails or returns not-allowed, the action does not run. Default behavior." },
  { term: "native agent / connected agent", def: "Native = identity created in BehalfID. Connected = manual record of an external agent (Ollie, ChatGPT, Claude, Zapier). Provider fields are metadata, not authentication." },
  { term: "Action Gateway", def: "The execution path BehalfID controls end-to-end. MVP: safe public web reads." },
  { term: "Site Guard", def: "The website-owner pattern for enforcing AI access at middleware/proxy/worker boundaries. Currently a preview, not a CDN." },
];

const voice = [
  { label: "Tone", yes: '"Verify every action before it runs."', no: '"Empower your agents with frictionless trust."' },
  { label: "Status", yes: '"Denied. No active purchase permission."', no: '"Oops! Something went wrong with this request."' },
  { label: "Scope", yes: '"Site Guard preview — design pattern, not a CDN."', no: '"Site Guard, the world\'s first AI gateway."' },
  { label: "Errors", yes: '"Action blocked by BehalfID: amount exceeds limit."', no: '"403 forbidden"' },
  { label: "Marketing", yes: '"Add a decision point before the agent acts."', no: '"Trust the future. We\'ve got this."' },
];

const donts = [
  { title: "No emoji in product chrome.", body: "Status is conveyed by border color, label, and decision text. No traffic lights, no checkmarks. Marketing pages may use ▪ as a list bullet — and that's it." },
  { title: "No gradient backgrounds on cards.", body: "One subtle radial behind the hero is fine. Cards stay flat. Gradient noise reads as marketing fluff and undermines the 'this is infrastructure' pitch." },
  { title: "No personification of agents.", body: "Agents don't think, want, or trust. They request actions. Permissions allow or deny those actions. Keep grammar in that frame." },
  { title: "No claims we haven't shipped.", body: '"Preview," "planned," and "MVP" are honest words. They appear in marketing because they appear in the product.' },
];

export default function BrandPage() {
  return (
    <>
      <DSNav current="brand" />

      <div className={s.doc}>

        <p className={s.kicker}>Brand</p>
        <h1 className={s.h1}>The permission layer between agents and action.</h1>
        <p className={s.lede} style={{ marginTop: 12 }}>
          BehalfID is permission infrastructure. The brand reflects what the product does: define a boundary, verify each action against it, and log the decision. Restraint over decoration. One accent color. No metaphors that hide what is happening.
        </p>

        {/* ── Mission ── */}
        <h2 className={s.h2}>Mission</h2>
        <p style={{ maxWidth: 720, color: "var(--text)", lineHeight: 1.7, fontSize: "1.04rem" }}>
          Give every agent a verifiable passport so its action is checked before it runs — not after.
        </p>

        {/* ── Principles ── */}
        <h2 className={s.h2}>Principles</h2>
        <div className={s.grid3}>
          {principles.map(({ num, title, body }) => (
            <div key={num} style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }}>
              <div style={{ font: "700 0.78rem/1 var(--font-mono)", color: "var(--accent)", letterSpacing: "0.1em" }}>{num}</div>
              <h3 style={{ margin: "14px 0 0", font: "700 1.05rem/1.3 var(--font-sans)", color: "var(--text)" }}>{title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--muted)", lineHeight: 1.6, fontSize: "0.94rem" }}>{body}</p>
            </div>
          ))}
        </div>

        {/* ── Logo ── */}
        <h2 className={s.h2}>Logo</h2>
        <p className={s.lede}>
          The logo is the wordmark &ldquo;BehalfID&rdquo; with <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>ID</code> in indigo. The mark is a square monogram derived from two rounded bars — neutral and accent — read as identity (II).
        </p>

        <div className={s.grid2} style={{ marginTop: 28 }}>
          {[
            { bg: "var(--bg)", caption: "Primary lockup", sub: "on --bg #000000", textColor: undefined, markBg: undefined },
            { bg: "var(--panel)", caption: "Panel surface", sub: "on --panel #0a0a0a", textColor: undefined, markBg: undefined },
            { bg: "#f6f5ee", caption: "Light surface", sub: "on warm white", textColor: "#0B0F14", markBg: "#0B0F14" },
            { bg: "linear-gradient(135deg, #6366F1, #4f52d6)", caption: "Inverse on accent", sub: "--accent #6366F1", textColor: "white", markBg: "rgba(255,255,255,0.12)" },
          ].map(({ bg, caption, sub, textColor, markBg }) => (
            <div key={caption}>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 56, background: bg, display: "grid", placeItems: "center", minHeight: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, transform: "scale(1.6)" }}>
                  <span style={{ width: 26, height: 26, background: markBg || "var(--panel)", border: `1px solid ${markBg ? "transparent" : "var(--border-strong)"}`, borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2, display: "block" }} />
                  </span>
                  <span style={{ font: "700 1rem/1 var(--font-sans)", letterSpacing: "-0.02em", color: textColor || "var(--text)" }}>
                    Behalf<span style={{ color: textColor === "white" ? "white" : "var(--accent)" }}>ID</span>
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, padding: "0 4px", color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <span>{caption}</span>
                <code style={{ color: "var(--text)", fontFamily: "var(--font-mono)", textTransform: "none", letterSpacing: 0 }}>{sub}</code>
              </div>
            </div>
          ))}
        </div>

        {/* ── Voice ── */}
        <h2 className={s.h2}>Voice</h2>
        <p className={s.lede}>
          Plain. Technical. Active. Address the developer in second person; describe the system in third person. Never personify the agent — it acts on behalf of someone, it doesn&apos;t decide.
        </p>
        <div style={{ marginTop: 28 }}>
          {voice.map(({ label, yes, no }) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 24, padding: "20px 0", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase", paddingTop: 4 }}>{label}</strong>
              <div style={{ color: "var(--text)", lineHeight: 1.5, paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, top: 8, width: 4, height: 4, borderRadius: "50%", background: "var(--ok)", display: "block" }} />
                <em style={{ display: "block", color: "var(--muted)", fontStyle: "normal", fontSize: "0.84rem", marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>Use</em>
                {yes}
              </div>
              <div style={{ color: "var(--text)", lineHeight: 1.5, paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, top: 8, width: 4, height: 4, borderRadius: "50%", background: "var(--deny)", display: "block" }} />
                <em style={{ display: "block", color: "var(--muted)", fontStyle: "normal", fontSize: "0.84rem", marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>Avoid</em>
                {no}
              </div>
            </div>
          ))}
        </div>

        {/* ── Glossary ── */}
        <h2 className={s.h2}>Glossary — say it the same way every time</h2>
        <p className={s.lede}>
          These are product nouns. Don&apos;t substitute synonyms. The console says &ldquo;permission,&rdquo; the docs say &ldquo;permission,&rdquo; the marketing site says &ldquo;permission.&rdquo;
        </p>
        <div style={{ marginTop: 24 }}>
          {glossary.map(({ term, def }) => (
            <div key={term} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
              <code style={{ color: "var(--accent)", fontSize: "0.94rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{term}</code>
              <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55 }}>{def}</p>
            </div>
          ))}
        </div>

        {/* ── What we don't do ── */}
        <h2 className={s.h2}>What we don&apos;t do</h2>
        <div className={s.grid2} style={{ marginTop: 16 }}>
          {donts.map(({ title, body }) => (
            <div key={title} style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }}>
              <h3 style={{ margin: 0, font: "700 1.05rem/1.3 var(--font-sans)", color: "var(--text)" }}>{title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--muted)", lineHeight: 1.6, fontSize: "0.94rem" }}>{body}</p>
            </div>
          ))}
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
