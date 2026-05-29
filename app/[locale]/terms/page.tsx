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
  const t = await getTranslations({ locale, namespace: "terms.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/terms" }
  };
}

export default async function TermsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "terms" });

  const tocItems = [
    { id: "acceptance",      key: "toc.item1" as const },
    { id: "description",     key: "toc.item2" as const },
    { id: "accounts",        key: "toc.item3" as const },
    { id: "api-keys",        key: "toc.item4" as const },
    { id: "acceptable-use",  key: "toc.item5" as const },
    { id: "developer",       key: "toc.item6" as const },
    { id: "billing",         key: "toc.item7" as const },
    { id: "ip",              key: "toc.item8" as const },
    { id: "availability",    key: "toc.item9" as const },
    { id: "warranties",      key: "toc.item10" as const },
    { id: "liability",       key: "toc.item11" as const },
    { id: "indemnification", key: "toc.item12" as const },
    { id: "termination",     key: "toc.item13" as const },
    { id: "governing-law",   key: "toc.item14" as const },
    { id: "contact",         key: "toc.item15" as const },
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

          <section className="legal-section" id="acceptance">
            <h2>{t("s1.heading")}</h2>
            <p>
              {t.rich("s1.body1", {
                privacyLink: (chunks) => <Link href="/privacy">{chunks}</Link>
              })}
            </p>
            <p>{t("s1.body2")}</p>
          </section>

          <section className="legal-section" id="description">
            <h2>{t("s2.heading")}</h2>
            <p>{t("s2.body1")}</p>
            <p>{t("s2.body2")}</p>
            <ul>
              <li>{t.rich("s2.item1", { code: (c) => <code>{c}</code> })}</li>
              <li>{t.rich("s2.item2", { code: (c) => <code>{c}</code> })}</li>
              <li>{t("s2.item3")}</li>
              <li>{t.rich("s2.item4", { code: (c) => <code>{c}</code> })}</li>
              <li>{t("s2.item5")}</li>
              <li>{t("s2.item6")}</li>
              <li>{t("s2.item7")}</li>
            </ul>
            <div className="legal-note">{t("s2.note")}</div>
          </section>

          <section className="legal-section" id="accounts">
            <h2>{t("s3.heading")}</h2>
            <p>{t("s3.body")}</p>
            <ul>
              <li>{t("s3.item1")}</li>
              <li>{t("s3.item2")}</li>
              <li>{t("s3.item3")}</li>
              <li>{t("s3.item4")}</li>
            </ul>
            <p>{t("s3.footer")}</p>
          </section>

          <section className="legal-section" id="api-keys">
            <h2>{t("s4.heading")}</h2>
            <p>{t("s4.body")}</p>
            <ul>
              <li>{t("s4.item1")}</li>
              <li>{t("s4.item2")}</li>
              <li>{t("s4.item3")}</li>
              <li>{t.rich("s4.item4", { code: (c) => <code>{c}</code> })}</li>
            </ul>
            <p>{t("s4.footer")}</p>
          </section>

          <section className="legal-section" id="acceptable-use">
            <h2>{t("s5.heading")}</h2>
            <p>{t("s5.body")}</p>
            <ul>
              <li>{t("s5.item1")}</li>
              <li>{t("s5.item2")}</li>
              <li>{t("s5.item3")}</li>
              <li>{t("s5.item4")}</li>
              <li>{t("s5.item5")}</li>
              <li>{t("s5.item6")}</li>
              <li>{t("s5.item7")}</li>
              <li>{t("s5.item8")}</li>
            </ul>
          </section>

          <section className="legal-section" id="developer">
            <h2>{t("s6.heading")}</h2>
            <p>{t("s6.body")}</p>
            <ul>
              <li><strong>{t("s6.item1Strong")}</strong>{t("s6.item1")}</li>
              <li><strong>{t("s6.item2Strong")}</strong>{t("s6.item2")}</li>
              <li><strong>{t("s6.item3Strong")}</strong>{t("s6.item3")}</li>
              <li><strong>{t("s6.item4Strong")}</strong>{t("s6.item4")}</li>
              <li>
                <strong>{t("s6.item5Strong")}</strong>
                {t.rich("s6.item5", { code: (c) => <code>{c}</code> })}
              </li>
            </ul>
          </section>

          <section className="legal-section" id="billing">
            <h2>{t("s7.heading")}</h2>
            <p>{t("s7.body")}</p>
            <ul>
              <li><strong>{t("s7.item1Strong")}</strong>{t("s7.item1")}</li>
              <li><strong>{t("s7.item2Strong")}</strong>{t("s7.item2")}</li>
              <li><strong>{t("s7.item3Strong")}</strong>{t("s7.item3")}</li>
              <li>
                <strong>{t("s7.item4Strong")}</strong>
                {t.rich("s7.item4", {
                  stripeLink: (chunks) => (
                    <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">{chunks}</a>
                  )
                })}
              </li>
              <li><strong>{t("s7.item5Strong")}</strong>{t("s7.item5")}</li>
            </ul>
          </section>

          <section className="legal-section" id="ip">
            <h2>{t("s8.heading")}</h2>
            <p>{t("s8.body1")}</p>
            <p>{t("s8.body2")}</p>
          </section>

          <section className="legal-section" id="availability">
            <h2>{t("s9.heading")}</h2>
            <p>{t("s9.body")}</p>
            <ul>
              <li>{t("s9.item1")}</li>
              <li>{t("s9.item2")}</li>
              <li>{t("s9.item3")}</li>
            </ul>
            <p>{t("s9.footer")}</p>
          </section>

          <section className="legal-section" id="warranties">
            <h2>{t("s10.heading")}</h2>
            <p><strong>{t("s10.body1")}</strong></p>
            <p>{t("s10.body2")}</p>
          </section>

          <section className="legal-section" id="liability">
            <h2>{t("s11.heading")}</h2>
            <p><strong>{t("s11.body1")}</strong></p>
            <p>{t("s11.body2")}</p>
            <p>{t("s11.body3")}</p>
          </section>

          <section className="legal-section" id="indemnification">
            <h2>{t("s12.heading")}</h2>
            <p>{t("s12.body")}</p>
            <ul>
              <li>{t("s12.item1")}</li>
              <li>{t("s12.item2")}</li>
              <li>{t("s12.item3")}</li>
              <li>{t("s12.item4")}</li>
              <li>{t("s12.item5")}</li>
            </ul>
          </section>

          <section className="legal-section" id="termination">
            <h2>{t("s13.heading")}</h2>
            <p>{t("s13.body1")}</p>
            <p>{t("s13.body2")}</p>
            <p>{t("s13.body3")}</p>
          </section>

          <section className="legal-section" id="governing-law">
            <h2>{t("s14.heading")}</h2>
            <p>{t("s14.body1")}</p>
            <p>{t("s14.body2")}</p>
          </section>

          <section className="legal-section legal-section--last" id="contact">
            <h2>{t("s15.heading")}</h2>
            <p>
              {t.rich("s15.body", {
                email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>
              })}
            </p>
            <p className="legal-also">
              {t.rich("s15.seeAlso", {
                privacyLink: (chunks) => <Link href="/privacy">{chunks}</Link>,
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
