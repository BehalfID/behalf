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
  const t = await getTranslations({ locale, namespace: "legal.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/legal" }
  };
}

export default async function LegalPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  const CONTACT = "legal@behalfid.com";

  const docs = [
    {
      href: "/terms" as const,
      title: t("docs.terms.title"),
      desc: t("docs.terms.desc"),
      sections: [
        t("docs.terms.s1"),
        t("docs.terms.s2"),
        t("docs.terms.s3"),
        t("docs.terms.s4"),
        t("docs.terms.s5"),
        t("docs.terms.s6"),
        t("docs.terms.s7"),
        t("docs.terms.s8"),
        t("docs.terms.s9"),
      ],
      updated: t("lastUpdated", { date: t("updatedDate") }),
    },
    {
      href: "/privacy" as const,
      title: t("docs.privacy.title"),
      desc: t("docs.privacy.desc"),
      sections: [
        t("docs.privacy.s1"),
        t("docs.privacy.s2"),
        t("docs.privacy.s3"),
        t("docs.privacy.s4"),
        t("docs.privacy.s5"),
        t("docs.privacy.s6"),
        t("docs.privacy.s7"),
      ],
      updated: t("lastUpdated", { date: t("updatedDate") }),
    },
    {
      href: "/security" as const,
      title: t("docs.security.title"),
      desc: t("docs.security.desc"),
      sections: [
        t("docs.security.s1"),
        t("docs.security.s2"),
        t("docs.security.s3"),
        t("docs.security.s4"),
        t("docs.security.s5"),
      ],
      updated: t("continuouslyUpdated"),
    },
  ];

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page legal-page--hub">
        <header className="legal-hero">
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="legal-meta legal-meta--wide">
            {t.rich("subtitle", {
              email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>,
              date: t("updatedDate")
            })}
          </p>
        </header>

        <div className="legal-hub">
          {docs.map((doc) => (
            <Link key={doc.href} href={doc.href} className="legal-hub__card">
              <div className="legal-hub__card-top">
                <h2 className="legal-hub__card-title">{doc.title}</h2>
                <span className="legal-hub__card-meta">{doc.updated}</span>
              </div>
              <p className="legal-hub__card-desc">{doc.desc}</p>
              <ul className="legal-hub__card-list" aria-label={`${doc.title} sections`}>
                {doc.sections.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <span className="legal-hub__card-cta" aria-hidden="true">
                {t("readDoc")}
              </span>
            </Link>
          ))}
        </div>

        <section className="legal-section legal-section--last legal-hub__contact">
          <h2>{t("contactHeading")}</h2>
          <p>
            {t.rich("contactBody", {
              email: (chunks) => <a href={`mailto:${CONTACT}`}>{chunks}</a>
            })}
          </p>
        </section>
      </div>

      <PublicFooter />
    </main>
  );
}
