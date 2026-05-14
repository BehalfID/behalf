import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — BehalfID",
  description: "How BehalfID collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" }
};

const EFFECTIVE = "14 May 2026";
const CONTACT   = "privacy@behalfid.com";

export default function PrivacyPage() {
  return (
    <main className="marketing">
      <PublicNav />

      <div className="legal-page">
        <header className="legal-hero">
          <p className="section-kicker">Legal</p>
          <h1>Privacy policy</h1>
          <p className="legal-meta">Effective {EFFECTIVE}</p>
        </header>

        <div className="legal-body">

          <section className="legal-section">
            <h2>1. Who we are</h2>
            <p>
              BehalfID (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates
              behalfid.com and provides permission-verification infrastructure for AI agents.
              Questions about this policy may be directed to{' '}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </section>

          <section className="legal-section">
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
              linked to user accounts for analytics purposes. We collect page-view data via
              Vercel Analytics (see <Link href="#analytics">§ 5</Link>).
            </p>

            <h3>Billing data</h3>
            <p>
              Payment card details are handled entirely by Stripe and are never transmitted to
              or stored on our servers. We receive subscription status, plan tier, and
              anonymised billing events from Stripe.
            </p>
          </section>

          <section className="legal-section">
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
              <code>behalf_cookie_consent</code>. It is not transmitted to our servers.
            </p>

            <h3>Third-party cookies</h3>
            <p>
              Stripe.js may set cookies on billing-related pages for fraud-prevention purposes.
              These are governed by{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                Stripe&rsquo;s privacy policy
              </a>.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. How we use your data</h2>
            <ul>
              <li>To authenticate and operate your developer account.</li>
              <li>To execute, log, and deliver webhook events for verification requests.</li>
              <li>To enforce rate limits and detect abuse.</li>
              <li>To process billing via Stripe.</li>
              <li>To understand aggregate usage patterns and improve the product (anonymised).</li>
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
              We use <strong>Vercel Analytics</strong> to count page views and measure
              navigation patterns. Vercel Analytics does not set cookies, does not use
              fingerprinting, and does not collect IP addresses or any other personally
              identifiable information. It is compliant with GDPR and PECR without requiring
              explicit cookie consent.
            </p>
            <p>
              No data is shared with advertising networks. No cross-site tracking occurs.
            </p>
          </section>

          <section className="legal-section">
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
                <strong>IP addresses used for rate limiting</strong> — stored in memory only;
                not persisted to disk.
              </li>
            </ul>
          </section>

          <section className="legal-section">
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
                  <td>Hosting and analytics</td>
                  <td>Request metadata, anonymised page-view data</td>
                </tr>
                <tr>
                  <td>Stripe</td>
                  <td>Payment processing</td>
                  <td>Email, subscription plan, billing events</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="legal-section">
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

          <section className="legal-section">
            <h2>9. Security</h2>
            <p>
              All data is transmitted over TLS. API keys are stored as SHA-256 hashes.
              Developer passwords are hashed with scrypt. Sessions use HTTP-only cookies.
              See our <Link href="/security">security page</Link> for a detailed breakdown of
              the enforcement model, secrets handling, and known limitations.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Changes to this policy</h2>
            <p>
              We may update this policy to reflect product changes or legal requirements. The
              effective date at the top of this page is updated whenever a material change is
              made. Continued use of BehalfID after a change constitutes acceptance of the
              revised policy.
            </p>
          </section>

          <section className="legal-section legal-section--last">
            <h2>11. Contact</h2>
            <p>
              Data controller: BehalfID<br />
              Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
