import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";

export const metadata: Metadata = {
  title: "Terms of Service — BehalfID",
  description: "Terms of Service for BehalfID, the permission infrastructure layer for AI agents.",
  alternates: { canonical: "/terms" }
};

const EFFECTIVE_DATE = "July 2, 2026";
const CONTACT_EMAIL = "legal@behalfid.com";

const TOC = [
  { id: "acceptance",       label: "1. Acceptance of Terms" },
  { id: "description",      label: "2. Description of Service" },
  { id: "accounts",         label: "3. Accounts and Eligibility" },
  { id: "api-keys",         label: "4. API Keys and Secrets" },
  { id: "acceptable-use",   label: "5. Acceptable Use" },
  { id: "developer",        label: "6. Developer Responsibilities" },
  { id: "billing",          label: "7. Billing and Payments" },
  { id: "ip",               label: "8. Intellectual Property" },
  { id: "availability",     label: "9. Service Availability and Modifications" },
  { id: "warranties",       label: "10. Disclaimer of Warranties" },
  { id: "liability",        label: "11. Limitation of Liability" },
  { id: "indemnification",  label: "12. Indemnification" },
  { id: "termination",      label: "13. Termination" },
  { id: "governing-law",    label: "14. Governing Law and Disputes" },
  { id: "contact",          label: "15. Contact" },
];

export default function TermsPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page">
        <header className="legal-hero">
          <p className="section-kicker">
            <Link href="/legal" className="legal-breadcrumb">Legal</Link>
            {" / "}Terms of Service
          </p>
          <h1>Terms of Service</h1>
          <p className="legal-meta">
            Effective {EFFECTIVE_DATE}. By creating an account or using BehalfID, you agree
            to these terms.
          </p>
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

          <section className="legal-section" id="acceptance">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By registering for an account, accessing the API, or using any BehalfID service, you
              agree to be bound by these Terms of Service and our{" "}
              <Link href="/privacy">Privacy Policy</Link>. If you are using BehalfID on behalf of an
              organization, you represent that you have authority to bind that organization to these
              terms.
            </p>
            <p>
              If you do not agree to these terms, you must not create an account or use any
              BehalfID service.
            </p>
          </section>

          <section className="legal-section" id="description">
            <h2>2. Description of Service</h2>
            <p>
              BehalfID is a developer-facing permission infrastructure platform. It provides
              tooling to define agent permissions, verify actions before AI agents execute them,
              record audit logs of decisions, and deliver signed webhook events for those decisions.
            </p>
            <p>
              BehalfID is currently offered as a prototype and early-access developer tool.
              The service includes:
            </p>
            <ul>
              <li>A developer portal for managing agents, permissions, API keys, and webhooks.</li>
              <li>A REST verification API (<code>POST /api/verify</code>) for pre-action enforcement.</li>
              <li>An Action Gateway for executing controlled, permission-gated operations.</li>
              <li>An SDK (<code>@behalfid/sdk</code>) for integration into your application or platform.</li>
              <li>Public permission passports for manual scope sharing with AI assistants.</li>
              <li>Webhook delivery with HMAC-SHA256 signing for downstream consumers.</li>
              <li>Audit logs scoped to your account and agents.</li>
            </ul>
            <div className="legal-note">
              BehalfID is a pre-action verification layer, not a replacement for application-level
              authorization. Your application is responsible for its own auth, input validation, and
              access control.
            </div>
          </section>

          <section className="legal-section" id="accounts">
            <h2>3. Accounts and Eligibility</h2>
            <p>
              You must be at least 18 years old and capable of forming a binding contract to use
              BehalfID. You are responsible for:
            </p>
            <ul>
              <li>
                Providing accurate registration and account-setup information (including your
                email address, password, and any profile or workspace details you submit).
              </li>
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activity that occurs under your account.</li>
              <li>Immediately notifying us of any unauthorized access to or use of your account.</li>
            </ul>
            <p>
              BehalfID reserves the right to refuse service, terminate accounts, or remove content
              at its sole discretion.
            </p>
          </section>

          <section className="legal-section" id="api-keys">
            <h2>4. API Keys and Secrets</h2>
            <p>
              API keys, passport tokens, and webhook signing secrets are your responsibility once
              issued. You must:
            </p>
            <ul>
              <li>Store API keys securely and never expose them in client-side code or public repositories.</li>
              <li>Rotate compromised keys immediately using the developer portal.</li>
              <li>
                Treat passport tokens as secrets — anyone holding a passport token can read the
                active permission scopes for that agent.
              </li>
              <li>
                Verify webhook signatures with <code>verifyWebhookSignature</code> before
                processing events.
              </li>
            </ul>
            <p>
              BehalfID stores only hashed representations of API keys, passport tokens, and webhook
              secrets. Lost keys cannot be recovered and must be rotated to obtain new ones. We are
              not liable for any damages arising from compromised or improperly stored credentials.
            </p>
          </section>

          <section className="legal-section" id="acceptable-use">
            <h2>5. Acceptable Use</h2>
            <p>You agree not to use BehalfID to:</p>
            <ul>
              <li>Violate any applicable law, regulation, or third-party rights.</li>
              <li>Send abusive, illegal, or fraudulent requests through the verification API or Action Gateway.</li>
              <li>Reverse-engineer, decompile, or attempt to extract source code from the service.</li>
              <li>Use the service to enable AI agents to take actions that are harmful, deceptive, or unauthorized by the users those agents serve.</li>
              <li>Bypass or circumvent the permission enforcement mechanisms provided by BehalfID.</li>
              <li>Resell, sublicense, or otherwise make the BehalfID API available to third parties as a standalone product without prior written consent.</li>
              <li>Introduce malicious code, overload infrastructure, or interfere with other users of the service.</li>
              <li>Use the Action Gateway to access private networks, internal systems, or any resource you do not have authorization to access.</li>
            </ul>
          </section>

          <section className="legal-section" id="developer">
            <h2>6. Developer Responsibilities</h2>
            <p>
              You, as the developer integrating BehalfID, are solely responsible for:
            </p>
            <ul>
              <li>
                <strong>Your integration.</strong> BehalfID cannot enforce any decision unless your
                code calls the verify endpoint before executing an agent action and fails closed on
                denial. The platform only enforces what you build around it.
              </li>
              <li>
                <strong>Your agents and their actions.</strong> You are responsible for the behavior
                of any AI agents you register, their integrations, and any actions they take,
                permitted or otherwise.
              </li>
              <li>
                <strong>End-user data.</strong> If your integration passes end-user personal data
                as metadata in verification calls, you are responsible for ensuring you have the
                appropriate legal basis to do so.
              </li>
              <li>
                <strong>Manual mode limitations.</strong> Passport links and agent memory blocks
                are best-effort guidance tools. BehalfID cannot control the behavior of
                third-party AI providers. Manual mode is not an enforcement boundary.
              </li>
              <li>
                <strong>Webhook receivers.</strong> You are responsible for securing and correctly
                processing webhook events, including deduplication by <code>eventId</code>.
              </li>
            </ul>
          </section>

          <section className="legal-section" id="billing">
            <h2>7. Billing and Payments</h2>
            <p>
              BehalfID offers a free tier and paid plans. Paid plans are billed on a recurring
              subscription basis. By subscribing to a paid plan you authorize BehalfID to charge
              the payment method you provide via Stripe.
            </p>
            <ul>
              <li>
                <strong>Pricing.</strong> Current plan pricing is shown on the billing page in
                the developer portal. We may change prices with at least 30 days&apos; notice.
              </li>
              <li>
                <strong>Renewals.</strong> Subscriptions renew automatically unless cancelled
                before the end of the billing period.
              </li>
              <li>
                <strong>Cancellations.</strong> You may cancel at any time through the developer
                portal. Access continues until the end of the paid billing period; no partial
                refunds are issued for unused time unless required by law.
              </li>
              <li>
                <strong>Payment processing.</strong> Payments are processed by Stripe. Your
                payment card details are held exclusively by Stripe and are not stored by
                BehalfID. See Stripe&apos;s{" "}
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                  privacy policy
                </a>
                {" "}for details on how they handle your data.
              </li>
              <li>
                <strong>Taxes.</strong> Prices are exclusive of applicable taxes. You are
                responsible for any sales, use, VAT, GST, or similar taxes where applicable.
              </li>
            </ul>
          </section>

          <section className="legal-section" id="ip">
            <h2>8. Intellectual Property</h2>
            <p>
              BehalfID and its logo, design, API structure, SDK, and documentation are the
              intellectual property of BehalfID and its owners. These terms do not grant you any
              right, title, or interest in any BehalfID intellectual property.
            </p>
            <p>
              You retain ownership of any permission configurations, agent descriptions, and data
              you create within the platform. By using BehalfID, you grant us a limited license to
              store and process that data solely to provide the service.
            </p>
          </section>

          <section className="legal-section" id="availability">
            <h2>9. Service Availability and Modifications</h2>
            <p>
              BehalfID is provided on an as-is, as-available basis. We do not guarantee
              uninterrupted or error-free operation of the service. We reserve the right to:
            </p>
            <ul>
              <li>Modify, suspend, or discontinue any part of the service at any time with or without notice.</li>
              <li>Update or change these Terms of Service. Continued use of the service after changes constitutes acceptance of the new terms.</li>
              <li>Change pricing with reasonable advance notice as described in Section 7.</li>
            </ul>
            <p>
              Because BehalfID is currently a prototype, the service may have outages, breaking
              API changes, or data loss. Do not rely on BehalfID as the sole enforcement or
              authorization mechanism for production systems handling sensitive data or irreversible
              financial transactions.
            </p>
          </section>

          <section className="legal-section" id="warranties">
            <h2>10. Disclaimer of Warranties</h2>
            <p>
              <strong>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BEHALFID AND ITS OWNERS,
                OFFICERS, AND AGENTS DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT
                NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                TITLE, AND NON-INFRINGEMENT.
              </strong>
            </p>
            <p>
              We do not warrant that: (a) the service will meet your specific requirements;
              (b) the service will be uninterrupted, timely, secure, or error-free; (c) any
              results obtained from use of the service will be accurate or reliable; (d) any
              errors in the service will be corrected.
            </p>
          </section>

          <section className="legal-section" id="liability">
            <h2>11. Limitation of Liability</h2>
            <p>
              <strong>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL BEHALFID,
                ITS OWNERS, OFFICERS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                SPECIAL, EXEMPLARY, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
                TO LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION, ARISING OUT OF OR
                IN CONNECTION WITH THESE TERMS OR YOUR USE OF OR INABILITY TO USE THE SERVICE,
                WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), OR ANY OTHER
                LEGAL THEORY, EVEN IF BEHALFID HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </strong>
            </p>
            <p>
              In no event shall BehalfID&apos;s total cumulative liability to you for all claims
              arising out of or relating to these terms or the service exceed the greater of
              (a) the amounts you have paid to BehalfID in the twelve months prior to the claim,
              or (b) one hundred US dollars ($100).
            </p>
            <p>
              Some jurisdictions do not allow the exclusion of certain warranties or the limitation
              of liability for certain types of damages, so some of the above limitations may not
              apply to you.
            </p>
          </section>

          <section className="legal-section" id="indemnification">
            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless BehalfID and its owners, officers,
              employees, and agents from and against any and all claims, damages, obligations,
              losses, liabilities, costs, and expenses (including reasonable legal fees) arising
              from:
            </p>
            <ul>
              <li>Your use of or access to the service.</li>
              <li>Your violation of these Terms of Service.</li>
              <li>Your violation of any third-party right, including any intellectual property or privacy right.</li>
              <li>Any actions taken by AI agents you register, integrate, or operate through BehalfID.</li>
              <li>Any claim that your use of the service caused damage to a third party.</li>
            </ul>
          </section>

          <section className="legal-section" id="termination">
            <h2>13. Termination</h2>
            <p>
              Either party may terminate this agreement at any time. You may delete your account
              through the developer portal or by contacting us. BehalfID may suspend or terminate
              your account at any time, with or without cause, and with or without notice.
            </p>
            <p>
              Upon termination: (a) your access to the service will cease immediately; (b) your
              API keys and passport tokens will be invalidated; (c) active paid subscriptions will
              not be automatically refunded; (d) we may retain your data for a reasonable period
              as required by applicable law or our internal policies, after which it will be deleted.
            </p>
            <p>
              Sections 10 (Disclaimer of Warranties), 11 (Limitation of Liability), 12
              (Indemnification), and 14 (Governing Law) survive termination.
            </p>
          </section>

          <section className="legal-section" id="governing-law">
            <h2>14. Governing Law and Disputes</h2>
            <p>
              These Terms of Service are governed by and construed in accordance with the laws of
              the United States, without regard to its conflict-of-law provisions. Any dispute
              arising under or relating to these terms shall be resolved through binding arbitration
              or in the courts of competent jurisdiction, at BehalfID&apos;s sole election.
            </p>
            <p>
              You waive any right to participate in a class action lawsuit or class-wide arbitration
              against BehalfID.
            </p>
          </section>

          <section className="legal-section legal-section--last" id="contact">
            <h2>15. Contact</h2>
            <p>
              For questions about these Terms of Service, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
            <p className="legal-also">
              See also: <Link href="/privacy">Privacy Policy</Link>{" · "}
              <Link href="/security">Security and Trust</Link>
            </p>
          </section>

        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
