import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink, CodeBlock, SplitCTAButton } from "@/components/ui";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "security.meta" });
  return {
    title: t("title"),
    description: t("description")
  };
}

export default async function SecurityPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "security" });

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="security-page">
        <header className="security-hero">
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="security-lede">{t("lede1")}</p>
          <p className="security-lede">{t("lede2")}</p>
        </header>

        {/* 1. Enforcement model */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s1.label")}</span>
            <h2>{t("s1.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>{t("s1.body1")}</p>
            <p>{t("s1.body2")}</p>
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
              {t.rich("s1.body3", {
                sandboxLink: (chunks) => <Link href="/sandbox">{chunks}</Link>
              })}
            </p>
            <div className="security-note">{t("s1.note")}</div>
          </div>
        </section>

        {/* 2. Manual mode limitations */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s2.label")}</span>
            <h2>{t("s2.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>{t("s2.body1")}</p>
            <p>{t("s2.body2")}</p>
            <p>{t("s2.body3")}</p>
            <div className="security-note">
              {t.rich("s2.note", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </div>
          </div>
        </section>

        {/* 3. Secrets and tokens */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s3.label")}</span>
            <h2>{t("s3.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>{t("s3.body1")}</p>
            <ul className="security-list">
              <li>{t.rich("s3.item1", { strong: (c) => <strong>{c}</strong>, code: (c) => <code>{c}</code> })}</li>
              <li>{t.rich("s3.item2", { strong: (c) => <strong>{c}</strong>, code: (c) => <code>{c}</code> })}</li>
              <li>{t.rich("s3.item3", { strong: (c) => <strong>{c}</strong>, code: (c) => <code>{c}</code> })}</li>
              <li>{t.rich("s3.item4", { strong: (c) => <strong>{c}</strong>, code: (c) => <code>{c}</code> })}</li>
            </ul>
            <p>{t("s3.body2")}</p>
          </div>
        </section>

        {/* 4. Public passport safety */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s4.label")}</span>
            <h2>{t("s4.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>
              {t.rich("s4.body1", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <p>{t("s4.body2")}</p>
            <ul className="security-list security-list--safe">
              <li>{t("s4.item1")}</li>
              <li>{t("s4.item2")}</li>
              <li>{t("s4.item3")}</li>
              <li>{t("s4.item4")}</li>
            </ul>
          </div>
        </section>

        {/* 5. Audit logs */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s5.label")}</span>
            <h2>{t("s5.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>{t("s5.body1")}</p>
            <ul className="security-list">
              <li>{t("s5.item1")}</li>
              <li>{t("s5.item2")}</li>
              <li>{t("s5.item3")}</li>
              <li>{t("s5.item4")}</li>
              <li>{t("s5.item5")}</li>
            </ul>
            <p>{t("s5.body2")}</p>
          </div>
        </section>

        {/* 6. Webhooks */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s6.label")}</span>
            <h2>{t("s6.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>
              {t.rich("s6.body1", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <p>
              {t.rich("s6.body2", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
          </div>
        </section>

        {/* 7. Revocation */}
        <section className="security-section">
          <div className="security-section__label">
            <span>{t("s7.label")}</span>
            <h2>{t("s7.heading")}</h2>
          </div>
          <div className="security-section__body">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>{t("s7.tableAction")}</th>
                  <th>{t("s7.tableEffect")}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>{t("s7.row1Action")}</td><td>{t("s7.row1Effect")}</td></tr>
                <tr><td>{t("s7.row2Action")}</td><td>{t("s7.row2Effect")}</td></tr>
                <tr><td>{t("s7.row3Action")}</td><td>{t("s7.row3Effect")}</td></tr>
                <tr><td>{t("s7.row4Action")}</td><td>{t("s7.row4Effect")}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 8. Known limitations */}
        <section className="security-section security-section--last">
          <div className="security-section__label">
            <span>{t("s8.label")}</span>
            <h2>{t("s8.heading")}</h2>
          </div>
          <div className="security-section__body">
            <p>{t("s8.intro")}</p>
            <ul className="security-list">
              <li>{t("s8.item1")}</li>
              <li>{t("s8.item2")}</li>
              <li>{t("s8.item3")}</li>
              <li>{t("s8.item4")}</li>
              <li>{t("s8.item5")}</li>
              <li>{t("s8.item6")}</li>
              <li>{t("s8.item7")}</li>
            </ul>
            <div className="hero__actions" style={{ marginTop: "2rem" }}>
              <SplitCTAButton leftLabel="Build" leftHref="/signup" rightLabel="Log In" rightHref="/login" />
              <ButtonLink href="/docs">Docs</ButtonLink>
            </div>
          </div>
        </section>
      </div>

      <PublicFooter />
    </main>
  );
}
