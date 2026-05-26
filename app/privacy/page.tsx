import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — BehalfID",
  description: "How BehalfID collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" }
};

const EFFECTIVE = "26 May 2026";
const CONTACT   = "legal@behalfid.com";

const TOC = [
  { id: "who-we-are",          label: "1. Who we are" },
  { id: "data-we-collect",     label: "2. Data we collect" },
  { id: "cookies",             label: "3. Cookies and local storage" },
  { id: "how-we-use",          label: "4. How we use your data" },
  { id: "analytics",           label: "5. Analytics" },
  { id: "data-retention",      label: "6. Data retention" },
  { id: "third-parties",       label: "7. Third-party processors" },
  { id: "your-rights",         label: "8. Your rights" },
  { id: "security",            label: "9. Security" },
  { id: "changes",             label: "10. Changes to this policy" },
  { id: "contact",             label: "11. Contact" },
];

export default function PrivacyPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page">
        <header className="legal-hero">
          <p className="section-kicker">
            <Link href="/legal" className="legal-breadcrumb">Legal</Link>
            {" / "}Privacy policy
          </p>
          <h1>Privacy policy</h1>
          <p className="legal-meta">Effective {EFFECTIVE}</p>
        </header>

        {/* Table of contents */}
        <nav className="legal-toc" aria-label="Table of contents">
          <p className="legal-toc__heading">On this page</p>
          <ol className="legal-toc__list">
            {TOC.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-body">

          <section className="legal-section" id="who-we-are">
            <h2>1. Who we are</h2>
            <p>
              BehalfID (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates
              behalfid.com and provides permission-verification infrastructure for AI agents.
              Questions about this policy may be directed to{' '}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </section>

          <section className="legal-section" id="data-we-collect">
            <h2>2. Data we collect</h2>

            <h3>Account data</h3>
            <p>
              When you create a developer account we collect your email address and a hashed
              password. We do not store your plaintext password at any point.
            </p>

            <h3>Agent and permission data</h3>
            <p>
              Agent names, permission configurations, scope definitions, and expiry dates you
              create inside the dashboard are stored and associated with your account. API keys
              are stored only as SHA-256 hashes and are shown to you once at creation.
            </p>

            <h3>Verification request data</h3>
            <p>
              When your integration calls <code>POST /api/verify</code>, we log the agent ID,
              action, vendor or resource, optional amount, decision outcome, risk level, and a
              stable request ID. We do not log your API key; only its hash is ever stored. Raw
              metadata fields are logged only when <code>BEHALFID_LOG_METADATA</code> is
              enabled. Verification logs are accessible only to the account that owns the agent.
            </p>

            <h3>Technical and usage data</h3>
            <p>
              We collect IP addresses for rate-limiting and abuse prevention. These are not
              linked to user accounts for analytics or profiling purposes. Cookie-consent
              choices are also logged server-side (state only, no personal data) for
              product-integrity purposes.
            </p>

            <h3>Billing data</h3>
            <p>
              When you subscribe to a paid plan, billing is processed by Stripe. BehalfID
              stores your Stripe customer ID and subscription status but does not store your
              payment card details — those are held exclusively by Stripe. Billing data is
              used only to enforce plan limits and process your subscription.
            </p>
          </section>

          <section className="legal-section" id="cookies">
            <h2>3. Cookies and local storage</h2>

            <h3>Authentication cookie</h3>
            <p>
              A session cookie (<code>bhf_dev_session</code>) is set when you log in to the
              developer dashboard. It is HTTP-only, scoped to this domain, and expires when
              your session ends or after 30 days of inactivity. This cookie is strictly
              necessary — the dashboard cannot function without it.
            </p>

            <h3>Preferences</h3>
            <p>
              Theme preference (light / dark) is stored in <code>localStorage</code> and never
              transmitted to our servers.
            </p>

            <h3>Cookie consent</h3>
            <p>
              Your cookie-consent choice is stored in <code>localStorage</code> under the key{' '}
              <code>behalf_cookie_consent</code>. A minimal log entry (consent state only — no
              personal data) is also written server-side for product-integrity purposes.
            </p>

            <p>
              <strong>No third-party or advertising cookies are used.</strong> BehalfID does
              not load tracking pixels, fingerprinting scripts, or analytics SDKs.
            </p>

          </section>

          <section className="legal-section" id="how-we-use">
            <h2>4. How we use your data</h2>
            <ul>
              <li>To authenticate and operate your developer account.</li>
              <li>To execute, log, and deliver webhook events for verification requests.</li>
              <li>To enforce rate limits and detect abuse.</li>
              <li>To process billing and enforce plan limits via Stripe.</li>
              <li>To respond to support or security enquiries.</li>
            </ul>
            <p>
              We do not sell your personal data. We do not use your verification request data
              to train machine-learning models.
            </p>
          </section>

          <section className="legal-section" id="analytics">
            <h2>5. Analytics</h2>
            <p>
              BehalfID does not use third-party analytics, advertising networks, or
              cross-site tracking. No tracking cookies or fingerprinting scripts are loaded on
              any page of the service.
            </p>
          </section>

          <section className="legal-section" id="data-retention">
            <h2>6. Data retention</h2>
            <ul>
              <li>
                <strong>Verification logs</strong> — retained for 90 days, then automatically
                purged.
              </li>
              <li>
                <strong>Webhook delivery records</strong> — retained for 30 days.
              </li>
              <li>
                <strong>Account data</strong> — retained for the lifetime of the account.
                Deleted within 30 days of a verified deletion request.
              </li>
              <li>
                <strong>Billing data</strong> — retained for as long as required by applicable
                tax and accounting law (typically 7 years), even after account deletion.
              </li>
              <li>
                <strong>IP addresses used for rate limiting</strong> — stored in memory only;
                not persisted to disk.
              </li>
            </ul>
          </section>

          <section className="legal-section" id="third-parties">
            <h2>7. Third-party processors</h2>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Processor</th>
                  <th>Purpose</th>
                  <th>Data shared</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>MongoDB Atlas</td>
                  <td>Database hosting</td>
                  <td>All stored account, agent, and log data</td>
                </tr>
                <tr>
                  <td>Vercel</td>
                  <td>Hosting and edge delivery</td>
                  <td>Request metadata (IP, path) for routing and abuse prevention</td>
                </tr>
                <tr>
                  <td>Stripe</td>
                  <td>Payment processing and subscription management</td>
                  <td>Email address, billing name, payment card details (held by Stripe only), subscription events</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="legal-section" id="your-rights">
            <h2>8. Your rights</h2>
            <p>
              Depending on your jurisdiction you may have the right to access, correct, delete,
              or port your personal data, and to object to or restrict certain processing.
            </p>
            <p>
              To exercise any of these rights, email{' '}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will respond within 30 days.
              Verification logs can also be deleted immediately from the{' '}
              <Link href="/dashboard/logs">dashboard logs</Link> page.
            </p>
          </section>

          <section className="legal-section" id="security">
            <h2>9. Security</h2>
            <p>
              All data is transmitted over TLS. API keys are stored as SHA-256 hashes.
              Developer passwords are hashed with scrypt. Sessions use HTTP-only cookies.
              See our <Link href="/security">security page</Link> for a detailed breakdown of
              the enforcement model, secrets handling, and known limitations.
            </p>
          </section>

          <section className="legal-section" id="changes">
            <h2>10. Changes to this policy</h2>
            <p>
              We may update this policy to reflect product changes or legal requirements. The
              effective date at the top of this page is updated whenever a material change is
              made. Continued use of BehalfID after a change constitutes acceptance of the
              revised policy.
            </p>
          </section>

          <section className="legal-section legal-section--last" id="contact">
            <h2>11. Contact</h2>
            <p>
              Data controller: BehalfID<br />
              Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            </p>
            <p className="legal-also">
              See also: <Link href="/terms">Terms of Service</Link>{" · "}
              <Link href="/security">Security and Trust</Link>
            </p>
          </section>

        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
