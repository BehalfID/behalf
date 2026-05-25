import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Service — BehalfID",
  description: "Terms of Service for BehalfID, the permission infrastructure layer for AI agents.",
  alternates: { canonical: "/terms" }
};

const EFFECTIVE_DATE = "May 13, 2026";
const CONTACT_EMAIL = "legal@behalfid.com";

export default function TermsPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="security-page">
        <header className="security-hero">
          <p className="section-kicker">Legal</p>
          <h1>Terms of Service</h1>
          <p className="security-lede">
            These Terms of Service govern your use of BehalfID and its API, SDK, developer portal,
            and related services. By creating an account or using BehalfID, you agree to these
            terms.
          </p>
          <p className="security-lede" style={{ fontSize: "0.85rem", opacity: 0.6 }}>
            Effective date: {EFFECTIVE_DATE}
          </p>
        </header>

        <section className="security-section">
          <div className="security-section__label">
            <span>01</span>
            <h2>Acceptance of Terms</h2>
          </div>
          <div className="security-section__body">
            <p>
              By registering for an account, accessing the API, or using any BehalfID service, you
              agree to be bound by these Terms of Service and our{" "}
              <a href="/privacy">Privacy Policy</a>. If you are using BehalfID on behalf of an
              organization, you represent that you have authority to bind that organization to these
              terms.
            </p>
            <p>
              If you do not agree to these terms, you must not create an account or use any
              BehalfID service.
            </p>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>02</span>
            <h2>Description of Service</h2>
          </div>
          <div className="security-section__body">
            <p>
              BehalfID is a developer-facing permission infrastructure platform. It provides
              tooling to define agent permissions, verify actions before AI agents execute them,
              record audit logs of decisions, and deliver signed webhook events for those decisions.
            </p>
            <p>
              BehalfID is currently offered as a prototype and early-access developer tool.
              The service includes:
            </p>
            <ul className="security-list">
              <li>A developer portal for managing agents, permissions, API keys, and webhooks.</li>
              <li>A REST verification API (<code>POST /api/verify</code>) for pre-action enforcement.</li>
              <li>An Action Gateway for executing controlled, permission-gated operations.</li>
              <li>An SDK (<code>@behalfid/sdk</code>) for integration into your application or platform.</li>
              <li>Public permission passports for manual scope sharing with AI assistants.</li>
              <li>Webhook delivery with HMAC-SHA256 signing for downstream consumers.</li>
              <li>Audit logs scoped to your account and agents.</li>
            </ul>
            <div className="security-note">
              BehalfID is a pre-action verification layer, not a replacement for application-level
              authorization. Your application is responsible for its own auth, input validation, and
              access control.
            </div>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>03</span>
            <h2>Accounts and Eligibility</h2>
          </div>
          <div className="security-section__body">
            <p>
              You must be at least 18 years old and capable of forming a binding contract to use
              BehalfID. You are responsible for:
            </p>
            <ul className="security-list">
              <li>Providing accurate registration information (email address and password).</li>
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activity that occurs under your account.</li>
              <li>Immediately notifying us of any unauthorized access to or use of your account.</li>
            </ul>
            <p>
              BehalfID reserves the right to refuse service, terminate accounts, or remove content
              at its sole discretion.
            </p>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>04</span>
            <h2>API Keys and Secrets</h2>
          </div>
          <div className="security-section__body">
            <p>
              API keys, passport tokens, and webhook signing secrets are your responsibility once
              issued. You must:
            </p>
            <ul className="security-list">
              <li>Store API keys securely and never expose them in client-side code or public repositories.</li>
              <li>Rotate compromised keys immediately using the developer portal.</li>
              <li>Treat passport tokens as secrets — anyone holding a passport token can read the
                active permission scopes for that agent.</li>
              <li>Verify webhook signatures with <code>verifyWebhookSignature</code> before
                processing events.</li>
            </ul>
            <p>
              BehalfID stores only hashed representations of API keys, passport tokens, and webhook
              secrets. Lost keys cannot be recovered and must be rotated to obtain new ones. We are
              not liable for any damages arising from compromised or improperly stored credentials.
            </p>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>05</span>
            <h2>Acceptable Use</h2>
          </div>
          <div className="security-section__body">
            <p>You agree not to use BehalfID to:</p>
            <ul className="security-list">
              <li>Violate any applicable law, regulation, or third-party rights.</li>
              <li>Send abusive, illegal, or fraudulent requests through the verification API or Action Gateway.</li>
              <li>Reverse-engineer, decompile, or attempt to extract source code from the service.</li>
              <li>Use the service to enable AI agents to take actions that are harmful, deceptive, or unauthorized by the users those agents serve.</li>
              <li>Bypass or circumvent the permission enforcement mechanisms provided by BehalfID.</li>
              <li>Resell, sublicense, or otherwise make the BehalfID API available to third parties as a standalone product without prior written consent.</li>
              <li>Introduce malicious code, overload infrastructure, or interfere with other users of the service.</li>
              <li>Use the Action Gateway to access private networks, internal systems, or any resource you do not have authorization to access.</li>
            </ul>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>06</span>
            <h2>Developer Responsibilities</h2>
          </div>
          <div className="security-section__body">
            <p>
              You, as the developer integrating BehalfID, are solely responsible for:
            </p>
            <ul className="security-list">
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
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>07</span>
            <h2>Intellectual Property</h2>
          </div>
          <div className="security-section__body">
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
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>08</span>
            <h2>Service Availability and Modifications</h2>
          </div>
          <div className="security-section__body">
            <p>
              BehalfID is provided on an as-is, as-available basis. We do not guarantee
              uninterrupted or error-free operation of the service. We reserve the right to:
            </p>
            <ul className="security-list">
              <li>Modify, suspend, or discontinue any part of the service at any time with or without notice.</li>
              <li>Update or change these Terms of Service. Continued use of the service after changes constitutes acceptance of the new terms.</li>
              <li>Change pricing (if and when pricing is introduced), with reasonable advance notice.</li>
            </ul>
            <p>
              Because BehalfID is currently a prototype, the service may have outages, breaking
              API changes, or data loss. Do not rely on BehalfID as the sole enforcement or
              authorization mechanism for production systems handling sensitive data or irreversible
              financial transactions.
            </p>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>09</span>
            <h2>Disclaimer of Warranties</h2>
          </div>
          <div className="security-section__body">
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
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>10</span>
            <h2>Limitation of Liability</h2>
          </div>
          <div className="security-section__body">
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
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>11</span>
            <h2>Indemnification</h2>
          </div>
          <div className="security-section__body">
            <p>
              You agree to indemnify, defend, and hold harmless BehalfID and its owners, officers,
              employees, and agents from and against any and all claims, damages, obligations,
              losses, liabilities, costs, and expenses (including reasonable legal fees) arising
              from:
            </p>
            <ul className="security-list">
              <li>Your use of or access to the service.</li>
              <li>Your violation of these Terms of Service.</li>
              <li>Your violation of any third-party right, including any intellectual property or privacy right.</li>
              <li>Any actions taken by AI agents you register, integrate, or operate through BehalfID.</li>
              <li>Any claim that your use of the service caused damage to a third party.</li>
            </ul>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>12</span>
            <h2>Termination</h2>
          </div>
          <div className="security-section__body">
            <p>
              Either party may terminate this agreement at any time. You may delete your account
              through the developer portal or by contacting us. BehalfID may suspend or terminate
              your account at any time, with or without cause, and with or without notice.
            </p>
            <p>
              Upon termination: (a) your access to the service will cease immediately; (b) your
              API keys and passport tokens will be invalidated; (c) we may retain your data for
              a reasonable period as required by applicable law or our internal policies, after
              which it will be deleted.
            </p>
            <p>
              Sections 9 (Disclaimer of Warranties), 10 (Limitation of Liability), 11
              (Indemnification), and 13 (Governing Law) survive termination.
            </p>
          </div>
        </section>

        <section className="security-section">
          <div className="security-section__label">
            <span>13</span>
            <h2>Governing Law and Disputes</h2>
          </div>
          <div className="security-section__body">
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
          </div>
        </section>

        <section className="security-section security-section--last">
          <div className="security-section__label">
            <span>14</span>
            <h2>Contact</h2>
          </div>
          <div className="security-section__body">
            <p>
              For questions about these Terms of Service, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
            <p>
              See also our <a href="/privacy">Privacy Policy</a> and{" "}
              <a href="/security">Security and Trust</a> page.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/signup">Start building</ButtonLink>
              <ButtonLink href="/docs">Docs</ButtonLink>
            </div>
          </div>
        </section>
      </div>

      <PublicFooter />
    </main>
  );
}
