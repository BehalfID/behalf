import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance — BehalfID",
  description:
    "BehalfID's compliance posture: SOC 2, ISO 27001, HIPAA, GDPR, and CCPA controls and status.",
  alternates: { canonical: "/compliance" }
};

const CONTACT = "legal@behalfid.com";
const SECURITY_CONTACT = "security@behalfid.com";

/** Controls we have in place (used by multiple framework sections) */
const TECHNICAL_CONTROLS = [
  "All data in transit encrypted with TLS 1.2+",
  "API keys stored only as SHA-256 hashes — never in plaintext",
  "Developer passwords hashed with scrypt",
  "Session cookies are HTTP-only, SameSite-strict, and expire after 30 days of inactivity",
  "Webhook payloads signed with HMAC-SHA256; signatures verified before processing",
  "Verification logs retained for 90 days, webhook delivery records for 30 days",
  "Rate limiting on all public endpoints to prevent abuse",
  "Audit trail of every permission decision (agent ID, action, outcome, timestamp)",
  "IP addresses used only for rate limiting; not persisted or linked to accounts",
  "No third-party analytics, advertising trackers, or cross-site tracking scripts",
];

export default function CompliancePage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="legal-page">
        <header className="legal-hero">
          <p className="section-kicker">
            <Link href="/legal" className="legal-breadcrumb">Legal</Link>
            {" / "}Compliance
          </p>
          <h1>Compliance</h1>
          <p className="legal-meta legal-meta--wide">
            BehalfID is committed to strong security and privacy practices. This page documents
            our posture against the most common compliance frameworks and what controls are in
            place today. For questions or a compliance questionnaire, email{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </header>

        {/* Table of contents */}
        <nav className="legal-toc" aria-label="Table of contents">
          <p className="legal-toc__heading">On this page</p>
          <ol className="legal-toc__list">
            <li><a href="#soc2">SOC 2</a></li>
            <li><a href="#iso27001">ISO 27001</a></li>
            <li><a href="#hipaa">HIPAA</a></li>
            <li><a href="#gdpr">GDPR</a></li>
            <li><a href="#ccpa">CCPA / CPRA</a></li>
            <li><a href="#controls">Technical controls</a></li>
            <li><a href="#contact">Contact</a></li>
          </ol>
        </nav>

        <div className="legal-body">

          {/* SOC 2 */}
          <section className="legal-section" id="soc2">
            <h2>SOC 2</h2>

            <h3>Status</h3>
            <div className="compliance-badge compliance-badge--planned">
              Certification in progress
            </div>
            <p>
              BehalfID has not yet completed a SOC 2 Type II audit. We are currently
              implementing the organizational and technical controls required to achieve
              SOC 2 Type II certification across the Security, Availability, and
              Confidentiality trust service criteria.
            </p>

            <h3>Controls in place</h3>
            <p>
              The following SOC 2-relevant controls are already operational:
            </p>
            <ul>
              <li>
                <strong>CC6 — Logical and physical access controls.</strong> Access to production
                systems is restricted to authorized personnel. API keys are one-way hashed;
                session tokens are HTTP-only and short-lived.
              </li>
              <li>
                <strong>CC7 — System operations.</strong> Audit logs record every permission
                decision with a stable request ID, timestamp, agent, action, and outcome.
                Logs are retained for 90 days.
              </li>
              <li>
                <strong>CC9 — Risk mitigation.</strong> Rate limiting, HMAC-verified webhooks,
                and fail-closed enforcement are built into the verification API.
              </li>
              <li>
                <strong>A1 — Availability.</strong> The service is hosted on Vercel with
                automatic redundancy and global edge delivery. MongoDB Atlas provides
                managed database availability.
              </li>
              <li>
                <strong>C1 — Confidentiality.</strong> Secrets (API keys, webhook signing
                secrets, passport tokens) are hashed or stored only by the processor
                (Stripe). No plaintext secrets are stored.
              </li>
            </ul>

            <h3>In progress</h3>
            <ul>
              <li>Formal information security policy and risk register</li>
              <li>Vendor risk assessments for all sub-processors</li>
              <li>Employee security awareness training program</li>
              <li>Incident response and business continuity plan</li>
              <li>Change management policy and access review cadence</li>
              <li>Third-party penetration test</li>
              <li>Engagement with a licensed CPA firm for Type II audit</li>
            </ul>

            <p>
              If your organization requires SOC 2 documentation or has a questionnaire,
              contact <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </section>

          {/* ISO 27001 */}
          <section className="legal-section" id="iso27001">
            <h2>ISO 27001</h2>

            <h3>Status</h3>
            <div className="compliance-badge compliance-badge--planned">
              Controls being implemented
            </div>
            <p>
              BehalfID has not yet obtained ISO 27001 certification. ISO 27001 requires
              establishing a formal Information Security Management System (ISMS) and
              undergoing an accredited third-party audit. We are building the controls
              foundation required for future certification.
            </p>

            <h3>Annex A alignment</h3>
            <p>
              The following ISO 27001:2022 Annex A control families are partially or fully
              addressed in the current build:
            </p>
            <ul>
              <li>
                <strong>A.5 — Organizational controls.</strong> Acceptable use policy embedded
                in Terms of Service (§5). Data classification implicit in retention schedules.
              </li>
              <li>
                <strong>A.8 — Asset management.</strong> All data categories documented in the
                Privacy Policy. Retention and deletion schedules defined.
              </li>
              <li>
                <strong>A.5.14 — Information transfer.</strong> All data in transit over TLS;
                webhooks signed with HMAC-SHA256; secrets never transmitted in plaintext after
                issuance.
              </li>
              <li>
                <strong>A.8.5 — Secure authentication.</strong> Passwords hashed with scrypt;
                session tokens HTTP-only; API keys stored as SHA-256 hashes only.
              </li>
              <li>
                <strong>A.8.15 — Logging.</strong> Audit logs for every verification decision;
                consent state logged server-side; 90-day retention with automatic purge.
              </li>
              <li>
                <strong>A.5.29 — Information security during disruption.</strong> Rate limiting
                and fail-closed enforcement prevent abuse during outages or attacks.
              </li>
            </ul>

            <h3>Gaps being addressed</h3>
            <ul>
              <li>Formal ISMS scope document and policy hierarchy</li>
              <li>Statement of Applicability (SoA)</li>
              <li>Asset register and risk treatment plan</li>
              <li>Internal audit cadence and management review process</li>
              <li>Supplier security evaluation policy (A.5.19–A.5.22)</li>
            </ul>
          </section>

          {/* HIPAA */}
          <section className="legal-section" id="hipaa">
            <h2>HIPAA</h2>

            <h3>Status</h3>
            <div className="compliance-badge compliance-badge--conditional">
              BAA available on request — PHI handling is developer responsibility
            </div>
            <p>
              BehalfID does not collect, store, or process Protected Health Information (PHI)
              in the course of its normal operation. BehalfID is a permission-verification
              and audit-logging platform — it records <em>decisions</em> about agent actions,
              not the content of those actions.
            </p>

            <h3>Developer responsibilities</h3>
            <p>
              If you use BehalfID as part of a system that handles PHI (for example, an AI
              agent operating in a healthcare workflow), you are responsible for:
            </p>
            <ul>
              <li>
                <strong>Not passing PHI as metadata.</strong> Verification call metadata
                fields (e.g., <code>vendor</code>, <code>resource</code>, <code>metadata</code>)
                should not contain PHI. If <code>BEHALFID_LOG_METADATA</code> is enabled, those
                fields are stored in audit logs for 90 days.
              </li>
              <li>
                <strong>Ensuring your integration is the enforcement layer.</strong> BehalfID
                issues permission decisions; your application is responsible for the actual
                action execution and for protecting any PHI involved.
              </li>
              <li>
                <strong>Your own HIPAA compliance.</strong> Your application, database, and
                any AI provider you use must be independently HIPAA-compliant.
              </li>
            </ul>

            <h3>Business Associate Agreement</h3>
            <p>
              If your organization requires a Business Associate Agreement (BAA) as part of a
              HIPAA-covered deployment, contact{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to request one. We will review the
              deployment context and execute a BAA where appropriate.
            </p>

            <h3>Technical safeguards in place</h3>
            <ul>
              <li>All data encrypted in transit (TLS 1.2+) — aligns with HIPAA Technical Safeguards §164.312(e).</li>
              <li>Access controls: API keys, sessions, and role scoping — aligns with §164.312(a).</li>
              <li>Audit logs for all verification decisions — aligns with §164.312(b).</li>
              <li>Automatic log purge (90 days) limits unnecessary PHI retention exposure.</li>
            </ul>
          </section>

          {/* GDPR */}
          <section className="legal-section" id="gdpr">
            <h2>GDPR</h2>

            <h3>Status</h3>
            <div className="compliance-badge compliance-badge--active">
              Controls operational
            </div>
            <p>
              BehalfID processes personal data of EU/EEA residents (primarily developer account
              data and verification logs) and takes the following steps to comply with the
              General Data Protection Regulation (GDPR):
            </p>

            <h3>Lawful basis for processing</h3>
            <ul>
              <li>
                <strong>Contract (Art. 6(1)(b)).</strong> Account data, API key hashes, agent
                configurations, and verification logs are processed to fulfill the service
                contract with developers.
              </li>
              <li>
                <strong>Legitimate interests (Art. 6(1)(f)).</strong> IP addresses for rate
                limiting and abuse prevention.
              </li>
              <li>
                <strong>Legal obligation (Art. 6(1)(c)).</strong> Billing data retained for
                statutory accounting periods.
              </li>
            </ul>

            <h3>Data subject rights</h3>
            <p>
              You can exercise any of the following rights by emailing{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We respond within 30 days.
            </p>
            <ul>
              <li><strong>Right of access (Art. 15)</strong> — request a copy of your data.</li>
              <li><strong>Right to rectification (Art. 16)</strong> — correct inaccurate data.</li>
              <li><strong>Right to erasure (Art. 17)</strong> — delete your account and data.</li>
              <li><strong>Right to restrict processing (Art. 18)</strong> — pause processing while a dispute is resolved.</li>
              <li><strong>Right to data portability (Art. 20)</strong> — export your account data in a machine-readable format.</li>
              <li><strong>Right to object (Art. 21)</strong> — object to processing based on legitimate interests.</li>
            </ul>
            <p>
              Verification logs can also be deleted immediately from the{" "}
              <Link href="/dashboard/logs">dashboard logs</Link> page.
            </p>

            <h3>Data transfers</h3>
            <p>
              Data may be processed in the United States by Vercel and MongoDB Atlas. Both
              processors operate under Standard Contractual Clauses (SCCs) for cross-border
              transfers. Stripe processes billing data under its own EU data transfer
              mechanisms.
            </p>

            <h3>Data Protection Officer</h3>
            <p>
              BehalfID does not currently have a formally appointed DPO (not required for
              organizations of our size where processing is not a core activity). Data
              protection enquiries should be directed to{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </p>
          </section>

          {/* CCPA */}
          <section className="legal-section" id="ccpa">
            <h2>CCPA / CPRA</h2>

            <h3>Status</h3>
            <div className="compliance-badge compliance-badge--active">
              Controls operational
            </div>
            <p>
              The California Consumer Privacy Act (CCPA) and California Privacy Rights Act
              (CPRA) grant California residents certain rights over their personal information.
              BehalfID&apos;s practices with respect to these rights:
            </p>

            <h3>Your rights under CCPA/CPRA</h3>
            <ul>
              <li>
                <strong>Right to know.</strong> You have the right to know what personal
                information we collect, use, disclose, and retain. Our{" "}
                <Link href="/privacy">Privacy Policy</Link> fully describes these categories
                and purposes.
              </li>
              <li>
                <strong>Right to delete.</strong> You have the right to request deletion of
                personal information we hold about you. Email{" "}
                <a href={`mailto:${CONTACT}`}>{CONTACT}</a> or delete verification logs
                directly from the <Link href="/dashboard/logs">dashboard</Link>.
              </li>
              <li>
                <strong>Right to correct.</strong> You have the right to request correction
                of inaccurate personal information.
              </li>
              <li>
                <strong>Right to opt out of sale or sharing.</strong> BehalfID does not sell
                or share personal information for cross-context behavioral advertising.
                There is nothing to opt out of.
              </li>
              <li>
                <strong>Right to limit use of sensitive personal information.</strong> We do
                not process sensitive personal information as defined under CPRA beyond what
                is necessary to provide the service.
              </li>
              <li>
                <strong>Non-discrimination.</strong> We will not discriminate against you for
                exercising any of these rights.
              </li>
            </ul>

            <h3>Submitting a request</h3>
            <p>
              To exercise any California privacy right, email{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with the subject line
              &ldquo;CCPA Request.&rdquo; We respond within 45 days.
            </p>
          </section>

          {/* Technical controls */}
          <section className="legal-section" id="controls">
            <h2>Technical controls summary</h2>
            <p>
              The following controls are operational across all compliance frameworks:
            </p>
            <ul>
              {TECHNICAL_CONTROLS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p>
              For a detailed technical breakdown of the enforcement model, secrets handling,
              and known limitations, see the{" "}
              <Link href="/security">Security and Trust</Link> page.
            </p>
          </section>

          {/* Contact */}
          <section className="legal-section legal-section--last" id="contact">
            <h2>Contact</h2>
            <p>
              For compliance questions, security disclosures, BAA requests, or data subject
              requests:
            </p>
            <ul>
              <li>
                <strong>Legal / compliance:</strong>{" "}
                <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
              </li>
              <li>
                <strong>Security disclosures:</strong>{" "}
                <a href={`mailto:${SECURITY_CONTACT}`}>{SECURITY_CONTACT}</a>
              </li>
            </ul>
            <p className="legal-also">
              See also: <Link href="/privacy">Privacy Policy</Link>{" · "}
              <Link href="/terms">Terms of Service</Link>{" · "}
              <Link href="/security">Security and Trust</Link>
            </p>
          </section>

        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
