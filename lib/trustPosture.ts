/**
 * Single source of truth for the dated compliance posture.
 *
 * Auditors need evidence with a date on it. Keeping the review date here means
 * the homepage trust strip, /compliance and /security cannot drift apart and
 * quietly start claiming different things.
 *
 * Bump POSTURE_REVIEWED whenever the statuses below are re-checked against the
 * full posture on /compliance.
 */

export const POSTURE_REVIEWED = "2026-08-11";
export const POSTURE_REVIEWED_LABEL = "11 August 2026";

export type PostureRow = {
  framework: string;
  status: string;
  detail: string;
};

export const POSTURE: PostureRow[] = [
  { framework: "SOC 2 Type II", status: "Not certified", detail: "Controls hardening underway." },
  { framework: "ISO 27001", status: "Not certified", detail: "No certification claimed or in audit." },
  { framework: "HIPAA", status: "Not applicable", detail: "Not intended for workflows processing PHI." },
  { framework: "GDPR", status: "Processor obligations in place", detail: "BehalfID acts as a data processor." },
  { framework: "CCPA / CPRA", status: "Compliant on sale and sharing", detail: "No sale of personal information." }
];
