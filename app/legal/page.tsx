import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal — BehalfID",
  description: "BehalfID legal documents: Terms of Service, Privacy Policy, and Security & Trust page.",
  alternates: { canonical: "/legal" }
};

const UPDATED = "May 26, 2026";
const CONTACT = "legal@behalfid.com";

const docs = [
  {
    title: "Terms of Service",
    href: "/terms",
    updated: UPDATED,
    desc: "The rules governing your use of BehalfID — accounts, API keys, acceptable use, billing, liability, and how disputes are handled.",
    sections: [
      "Acceptance of Terms",
      "Description of Service",
      "Accounts and Eligibility",
      "API Keys and Secrets",
      "Acceptable Use",
      "Developer Responsibilities",
      "Billing and Payments",
      "Intellectual Property",
      "Disclaimers and Liability",
    ],
  },
  {
    title: "Privacy Policy",
    href: "/privacy",
    updated: UPDATED,
    desc: "What data BehalfID collects, how it is used, who it is shared with, how long it is retained, and how to exercise your rights.",
    sections: [
      "Data we collect",
      "Cookies and local storage",
      "How we use your data",
      "Analytics (none)",
      "Data retention schedules",
      "Third-party processors",
      "Your rights (access, deletion, portability)",
    ],
  },
  {
    title: "Security and Trust",
    href: "/security",
    updated: "Continuously updated",
    desc: "The technical enforcement model, how secrets are stored, the fail-closed design, and the current known limitations of the platform.",
    sections: [
      "Enforcement model",
      "Secrets storage",
      "Fail-closed design",
      "Revocation and rotation",
      "Known limitations",
    ],
  },
];

export default function LegalPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page legal-page--hub">
        <header className="legal-hero">
          <p className="section-kicker">Legal</p>
          <h1>Legal documents</h1>
          <p className="legal-meta legal-meta--wide">
            All BehalfID policies and agreements in one place. Questions?{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </header>

        <div className="legal-hub">
          {docs.map((doc) => (
            <Link key={doc.href} href={doc.href} className="legal-hub__card">
              <div className="legal-hub__card-top">
                <h2 className="legal-hub__card-title">{doc.title}</h2>
                <span className="legal-hub__card-meta">Updated {doc.updated}</span>
              </div>
              <p className="legal-hub__card-desc">{doc.desc}</p>
              <ul className="legal-hub__card-list" aria-label={`${doc.title} sections`}>
                {doc.sections.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <span className="legal-hub__card-cta" aria-hidden="true">
                Read {doc.title} →
              </span>
            </Link>
          ))}
        </div>

        <section className="legal-section legal-section--last legal-hub__contact">
          <h2>Contact</h2>
          <p>
            For legal enquiries, data subject requests, or questions about any of these
            documents, email us at{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We aim to respond within 30 days.
          </p>
        </section>
      </div>

      <PublicFooter />
    </main>
  );
}
