import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
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
  const t = await getTranslations({ locale, namespace: "privacy.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/privacy" }
  };
}

export default async function PrivacyPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "privacy" });

  const tocItems = [
    { id: "who-we-are",      key: "toc.item1" as const },
    { id: "data-we-collect", key: "toc.item2" as const },
    { id: "cookies",         key: "toc.item3" as const },
    { id: "how-we-use",      key: "toc.item4" as const },
    { id: "analytics",       key: "toc.item5" as const },
    { id: "data-retention",  key: "toc.item6" as const },
    { id: "third-parties",   key: "toc.item7" as const },
    { id: "your-rights",     key: "toc.item8" as const },
    { id: "security",        key: "toc.item9" as const },
    { id: "changes",         key: "toc.item10" as const },
    { id: "contact",         key: "toc.item11" as const },
  ];

  const CONTACT = "legal@behalfid.com";

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page">
        <header className="legal-hero">
          <p className="section-kicker">
            <Link href="/legal" className="legal-breadcrumb">{t("breadcrumb")}</Link>
            {" / "}{t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p className="legal-meta">{t("effective", { date: t("effectiveDate") })}</p>
        </header>

        <nav className="legal-toc" aria-label={t("toc.heading")}>
          <p className="legal-toc__heading">{t("toc.heading")}</p>
          <ol className="legal-toc__list">
            {tocItems.map(({ id, key }) => (
              <li key={id}>
                <a href={`#${id}`}>{t(key)}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-body">

          <section className="legal-section" id="who-we-are">
            <h2>{t("s1.heading")}</h2>
            <p>
              {t.rich("s1.body", {
                email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>
              })}
            </p>
          </section>

          <section className="legal-section" id="data-we-collect">
            <h2>{t("s2.heading")}</h2>
            <h3>{t("s2.accountH")}</h3>
            <p>{t("s2.accountBody")}</p>
            <h3>{t("s2.setupH")}</h3>
            <p>{t("s2.setupIntro")}</p>
            <ul>
              <li>{t("s2.setupItem1")}</li>
              <li>{t("s2.setupItem2")}</li>
              <li>{t("s2.setupItem3")}</li>
              <li>{t("s2.setupItem4")}</li>
              <li>{t("s2.setupItem5")}</li>
              <li>{t("s2.setupItem6")}</li>
              <li>{t("s2.setupItem7")}</li>
            </ul>
            <p>{t("s2.setupOutro")}</p>
            <h3>{t("s2.agentH")}</h3>
            <p>{t("s2.agentBody")}</p>
            <h3>{t("s2.verifyH")}</h3>
            <p>
              {t.rich("s2.verifyBody", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <h3>{t("s2.techH")}</h3>
            <p>{t("s2.techBody")}</p>
            <h3>{t("s2.billingH")}</h3>
            <p>{t("s2.billingBody")}</p>
          </section>

          <section className="legal-section" id="cookies">
            <h2>{t("s3.heading")}</h2>
            <h3>{t("s3.authH")}</h3>
            <p>
              {t.rich("s3.authBody", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <h3>{t("s3.prefsH")}</h3>
            <p>
              {t.rich("s3.prefsBody", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <h3>{t("s3.consentH")}</h3>
            <p>
              {t.rich("s3.consentBody", {
                code: (chunks) => <code>{chunks}</code>
              })}
            </p>
            <p><strong>{t("s3.noThirdParty")}</strong></p>
          </section>

          <section className="legal-section" id="how-we-use">
            <h2>{t("s4.heading")}</h2>
            <ul>
              <li>{t("s4.item1")}</li>
              <li>{t("s4.item2")}</li>
              <li>{t("s4.item3")}</li>
              <li>{t("s4.item4")}</li>
              <li>{t("s4.item5")}</li>
              <li>{t("s4.item6")}</li>
            </ul>
            <p>{t("s4.noSell")}</p>
          </section>

          <section className="legal-section" id="analytics">
            <h2>{t("s5.heading")}</h2>
            <p>{t("s5.body")}</p>
          </section>

          <section className="legal-section" id="data-retention">
            <h2>{t("s6.heading")}</h2>
            <ul>
              <li><strong>{t("s6.item1Strong")}</strong>{t("s6.item1")}</li>
              <li><strong>{t("s6.item2Strong")}</strong>{t("s6.item2")}</li>
              <li><strong>{t("s6.item3Strong")}</strong>{t("s6.item3")}</li>
              <li><strong>{t("s6.item4Strong")}</strong>{t("s6.item4")}</li>
              <li><strong>{t("s6.item5Strong")}</strong>{t("s6.item5")}</li>
            </ul>
          </section>

          <section className="legal-section" id="third-parties">
            <h2>{t("s7.heading")}</h2>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>{t("s7.colProcessor")}</th>
                  <th>{t("s7.colPurpose")}</th>
                  <th>{t("s7.colData")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("s7.row1Proc")}</td>
                  <td>{t("s7.row1Purpose")}</td>
                  <td>{t("s7.row1Data")}</td>
                </tr>
                <tr>
                  <td>{t("s7.row2Proc")}</td>
                  <td>{t("s7.row2Purpose")}</td>
                  <td>{t("s7.row2Data")}</td>
                </tr>
                <tr>
                  <td>{t("s7.row3Proc")}</td>
                  <td>{t("s7.row3Purpose")}</td>
                  <td>{t("s7.row3Data")}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="legal-section" id="your-rights">
            <h2>{t("s8.heading")}</h2>
            <p>{t("s8.body1")}</p>
            <p>
              {t.rich("s8.body2", {
                email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>,
                logsLink: (chunks) => <Link href="/dashboard/logs">{chunks}</Link>
              })}
            </p>
          </section>

          <section className="legal-section" id="security">
            <h2>{t("s9.heading")}</h2>
            <p>
              {t.rich("s9.body", {
                securityLink: (chunks) => <Link href="/security">{chunks}</Link>
              })}
            </p>
          </section>

          <section className="legal-section" id="changes">
            <h2>{t("s10.heading")}</h2>
            <p>{t("s10.body")}</p>
          </section>

          <section className="legal-section legal-section--last" id="contact">
            <h2>{t("s11.heading")}</h2>
            <p>
              {t("s11.controller")}<br />
              {t.rich("s11.email", {
                email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>
              })}
            </p>
            <p className="legal-also">
              {t.rich("s11.seeAlso", {
                termsLink: (chunks) => <Link href="/terms">{chunks}</Link>,
                securityLink: (chunks) => <Link href="/security">{chunks}</Link>
              })}
            </p>
          </section>

        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
