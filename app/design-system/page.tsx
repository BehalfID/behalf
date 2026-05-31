import Link from "next/link";
import { Logo } from "@/components/ui";
import s from "./page.module.css";

const systemSections = [
  {
    num: "001 / Brand",
    title: "Brand",
    copy: "Mission, principles, glossary. The exact words every surface uses.",
    tags: ["voice", "glossary", "logo"],
    href: "/design-system/brand",
  },
  {
    num: "002 / Color",
    title: "Color",
    copy: "Pure black canvas, hairline borders, one accent, three statuses.",
    tags: ["surface", "accent", "status"],
    href: "/design-system/colors",
  },
  {
    num: "003 / Type",
    title: "Typography",
    copy: "Inter for prose. JetBrains Mono for anything copied verbatim.",
    tags: ["inter", "jetbrains mono", "scale"],
    href: "/design-system/typography",
  },
  {
    num: "004 / Components",
    title: "Components",
    copy: "Buttons, inputs, badges, cards, code blocks — matched to production.",
    tags: ["btn", "badge", "card", "codeblock"],
    href: "/design-system/components",
  },
  {
    num: "005 / Patterns",
    title: "Patterns",
    copy: "Decision packet, pipeline, hero, action grid, app shell, audit.",
    tags: ["packet", "pipeline", "audit"],
    href: "/design-system/patterns",
  },
  {
    num: "006 / Characteristics",
    title: "Characteristics",
    copy: "The principles, foundations, and applied examples that define the look.",
    tags: ["principles", "tokens", "examples"],
    href: "/design-system/characteristics",
  },
];

const appliedExamples = [
  {
    num: "— Site / Home",
    title: "Homepage",
    copy: "The full marketing surface. Hero, decision packet, four-step model, developer enforcement.",
    tags: ["hero", "packet", "cta"],
    href: "/",
  },
  {
    num: "— Site / Sandbox",
    title: "Sandbox",
    copy: "Live, interactive enforcement demo. Switch the simulated request, watch the trace fire.",
    tags: ["interactive", "trace", "audit"],
    href: "/sandbox",
  },
  {
    num: "— Site / Security",
    title: "Security",
    copy: "Long-form content surface. Numbered sections, fail-closed examples, honest limitations.",
    tags: ["long-form", "numbered", "code"],
    href: "/security",
  },
];

function SectionCard({
  num,
  title,
  copy,
  tags,
  href,
}: {
  num: string;
  title: string;
  copy: string;
  tags: string[];
  href: string;
}) {
  return (
    <Link className={s.sectionCard} href={href}>
      <div className={s.sectionCardHead}>
        <span className={s.sectionCardNum}>{num}</span>
        <span className={s.sectionCardArrow}>↗</span>
      </div>
      <div className={s.sectionCardTitle}>{title}</div>
      <p className={s.sectionCardCopy}>{copy}</p>
      <div className={s.sectionCardTags}>
        {tags.map((tag) => (
          <span key={tag} className={s.sectionCardTag}>
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}

function DecisionPacketVisual() {
  return (
    <div className={s.heroVisual}>
      <h4>Decision packet</h4>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>action</span>
        <span className={s.visualVal}>purchase</span>
      </div>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>vendor</span>
        <span className={s.visualVal}>coachella.com</span>
      </div>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>amount</span>
        <span className={s.visualVal}>$742.00</span>
      </div>
      <div className={s.visualDivider}>behalfid · decision boundary</div>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>decision</span>
        <span style={{ color: "var(--deny)" }}>denied</span>
      </div>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>execution</span>
        <span className={s.visualVal}>false</span>
      </div>
      <div className={s.visualRow}>
        <span className={s.visualLbl}>audit</span>
        <span className={s.visualVal}>verification.denied</span>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <>
      {/* ── Top nav ─────────────────────────────── */}
      <header className={s.topnav}>
        <div className={s.topnavInner}>
          <div className={s.topnavGroup}>
            <Logo href="/design-system" />
            <span className={s.topnavDivider} />
            <span className={s.topnavSub}>design system</span>
          </div>
          <nav className={s.topnavLinks}>
            <Link href="/design-system" aria-current="page">Overview</Link>
            <Link href="/design-system/characteristics">Characteristics</Link>
            <Link href="/design-system/brand">Brand</Link>
            <Link href="/design-system/colors">Color</Link>
            <Link href="/design-system/typography">Type</Link>
            <Link href="/design-system/components">Components</Link>
            <Link href="/design-system/patterns">Patterns</Link>
          </nav>
          <div className={s.topnavCta}>
            <span className={s.versionBadge}>v1.0</span>
            <Link className={s.buildBtn} href="/design-system/components">
              Build →
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────── */}
      <section className={s.hero}>
        <div className={s.wrap}>
          <div className={s.heroMeta}>
            <span>Design system · v1.0</span>
            <span>2026.05</span>
            <span>permission infrastructure</span>
          </div>
          <div className={s.heroGrid}>
            <div className={s.heroLeft}>
              <h1>
                The system behind <em>behalfid.com.</em>
              </h1>
              <p>
                The visual + verbal language for an enforcement product. Pure black canvas,
                hairline borders, one accent. Built for clarity at the moment a decision
                crosses the boundary.
              </p>
              <div className={s.heroActions}>
                <Link className={s.buildBtn} href="/design-system/components">
                  Browse components
                </Link>
                <Link className={s.buildBtn} href="/design-system/characteristics">
                  Read characteristics
                </Link>
              </div>
            </div>
            <DecisionPacketVisual />
          </div>
        </div>
      </section>

      {/* ── System sections ─────────────────────── */}
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.secHead}>
            <div>
              <div className={s.secEyebrow}>01 — System</div>
              <h2 className={s.secTitle}>
                Five surfaces. <em>One token spine.</em>
              </h2>
            </div>
            <Link className={s.secCta} href="/design-system/characteristics">
              Read the characteristics →
            </Link>
          </div>
        </div>
      </section>

      <div className={s.wrap} style={{ padding: 0 }}>
        <div className={s.sections}>
          {systemSections.map((section) => (
            <SectionCard key={section.num} {...section} />
          ))}
        </div>
      </div>

      {/* ── Applied examples ─────────────────────── */}
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.secHead}>
            <div>
              <div className={s.secEyebrow}>02 — Applied</div>
              <h2 className={s.secTitle}>The system, deployed.</h2>
            </div>
            <Link className={s.secCta} href="/">
              Site examples →
            </Link>
          </div>
        </div>
      </section>

      <div className={s.wrap} style={{ padding: 0 }}>
        <div className={s.sections}>
          {appliedExamples.map((example) => (
            <SectionCard key={example.num} {...example} />
          ))}
        </div>
      </div>

      {/* ── Start section ───────────────────────── */}
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.twoCol}>
            <div className={s.twoColCell}>
              <div className={s.secEyebrow}>For designers</div>
              <h3>Start with the characteristics.</h3>
              <p>
                Every page in the system is built on the same four-color surface scale,
                two-family type system, and hairline-everything geometry. Read the
                principles before you reach for primitives.
              </p>
              <ul className={s.twoColList}>
                <li>
                  <Link href="/design-system/characteristics">Read the characteristics</Link>
                </li>
                <li>
                  <Link href="/design-system/brand">Brand voice and glossary</Link>
                </li>
                <li>
                  <Link href="/design-system/patterns">Recurring layout patterns</Link>
                </li>
              </ul>
            </div>
            <div className={s.twoColCell}>
              <div className={s.secEyebrow}>For engineers</div>
              <h3>Two stylesheets. Then build.</h3>
              <p>
                Import <code className={s.inlineCode}>tokens.css</code> and{" "}
                <code className={s.inlineCode}>primitives.css</code>. Use{" "}
                <code className={s.inlineCode}>site.css</code> if you&apos;re shipping a
                marketing surface. Every variable maps directly to production.
              </p>
              <ul className={s.twoColList}>
                <li>
                  <Link href="/design-system/components">Component library</Link>
                </li>
                <li>
                  <Link href="https://github.com/behalfid/behalf" target="_blank" rel="noopener noreferrer">
                    Reference source
                  </Link>
                </li>
                <li>
                  <Link href="/design-system/brand">Brand guidelines</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────── */}
      <footer className={s.foot}>
        <div className={s.wrap}>
          <div className={s.footInner}>
            <div>
              <div className={s.footBrand}>behalfid · design system v1.0</div>
              Pure black canvas. One accent. Hairline everything.
              <br />
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
                <h5>Source</h5>
                <ul>
                  <li>
                    <Link href="https://github.com/behalfid/behalf" target="_blank" rel="noopener noreferrer">
                      GitHub
                    </Link>
                  </li>
                  <li><Link href="/docs">Docs</Link></li>
                  <li><Link href="/docs/quickstart">Quickstart</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
