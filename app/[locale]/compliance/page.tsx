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
  const t = await getTranslations({ locale, namespace: "compliance.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/compliance" }
  };
}

export default async function CompliancePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "compliance" });

  const CONTACT = "legal@behalfid.com";
  const SECURITY_CONTACT = "security@behalfid.com";

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
          <p className="legal-meta legal-meta--wide">
            {t.rich("subtitle", {
              email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>
            })}
          </p>
        </header>

        <nav className="legal-toc" aria-label={t("toc.heading")}>
          <p className="legal-toc__heading">{t("toc.heading")}</p>
          <ol className="legal-toc__list">
            <li><a href="#soc2">{t("toc.soc2")}</a></li>
            <li><a href="#iso27001">{t("toc.iso")}</a></li>
            <li><a href="#hipaa">{t("toc.hipaa")}</a></li>
            <li><a href="#gdpr">{t("toc.gdpr")}</a></li>
            <li><a href="#ccpa">{t("toc.ccpa")}</a></li>
            <li><a href="#controls">{t("toc.controls")}</a></li>
            <li><a href="#contact">{t("toc.contact")}</a></li>
          </ol>
        </nav>

        <div className="legal-body">

          <section className="legal-section" id="soc2">
            <h2>{t("soc2.heading")}</h2>
            <h3>{t("soc2.statusHeading")}</h3>
            <div className="compliance-badge compliance-badge--planned">
              {t("statusInProgress")}
            </div>
            <p>{t("soc2.body1")}</p>
            <h3>{t("soc2.controlsHeading")}</h3>
            <p>{t("controls.body")}</p>
            <ul>
              <li>{t("controls.item1")}</li>
              <li>{t("controls.item5")}</li>
              <li>{t("controls.item8")}</li>
              <li>{t("controls.item7")}</li>
            </ul>
            <h3>{t("soc2.roadmapHeading")}</h3>
            <p>{t("soc2.roadmapBody")}</p>
          </section>

          <section className="legal-section" id="iso27001">
            <h2>{t("iso.heading")}</h2>
            <h3>{t("iso.statusHeading")}</h3>
            <div className="compliance-badge compliance-badge--planned">
              {t("statusNotCertified")}
            </div>
            <p>{t("iso.body")}</p>
          </section>

          <section className="legal-section" id="hipaa">
            <h2>{t("hipaa.heading")}</h2>
            <h3>{t("hipaa.statusHeading")}</h3>
            <div className="compliance-badge compliance-badge--conditional">
              {t("statusNotApplicable")}
            </div>
            <p>{t("hipaa.body1")}</p>
            <p>{t("hipaa.body2")}</p>
          </section>

          <section className="legal-section" id="gdpr">
            <h2>{t("gdpr.heading")}</h2>
            <h3>{t("gdpr.statusHeading")}</h3>
            <div className="compliance-badge compliance-badge--active">
              {t("statusPartial")}
            </div>
            <p>{t("gdpr.body1")}</p>
            <ul>
              <li>{t("gdpr.item1")}</li>
              <li>{t("gdpr.item2")}</li>
              <li>{t("gdpr.item3")}</li>
              <li>{t("gdpr.item4")}</li>
              <li>{t("gdpr.item5")}</li>
            </ul>
            <p>{t("gdpr.body2")}</p>
          </section>

          <section className="legal-section" id="ccpa">
            <h2>{t("ccpa.heading")}</h2>
            <h3>{t("ccpa.statusHeading")}</h3>
            <div className="compliance-badge compliance-badge--active">
              {t("statusImplemented")}
            </div>
            <p>{t("ccpa.body1")}</p>
            <p>{t("ccpa.body2")}</p>
            <ul>
              <li>{t("ccpa.item1")}</li>
              <li>{t("ccpa.item2")}</li>
              <li>{t("ccpa.item3")}</li>
              <li>{t("ccpa.item4")}</li>
            </ul>
            <p>{t("ccpa.body3")}</p>
          </section>

          <section className="legal-section" id="controls">
            <h2>{t("controls.heading")}</h2>
            <p>{t("controls.body")}</p>
            <ul>
              <li>{t("controls.item1")}</li>
              <li>{t("controls.item2")}</li>
              <li>{t("controls.item3")}</li>
              <li>{t("controls.item4")}</li>
              <li>{t("controls.item5")}</li>
              <li>{t("controls.item6")}</li>
              <li>{t("controls.item7")}</li>
              <li>{t("controls.item8")}</li>
              <li>{t("controls.item9")}</li>
              <li>{t("controls.item10")}</li>
            </ul>
          </section>

          <section className="legal-section legal-section--last" id="contact">
            <h2>{t("contact.heading")}</h2>
            <p>
              {t.rich("contact.body", {
                email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>,
                secEmail: (chunks) => <a href={`mailto:${SECURITY_CONTACT}`}>{chunks}</a>
              })}
            </p>
          </section>

        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
