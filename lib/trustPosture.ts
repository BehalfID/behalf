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

/**
 * Statuses mirror the badges on /compliance exactly. Keep them in sync — the
 * point of surfacing a summary is that it cannot say something the detail page
 * does not. "Controls operational" is a description of what we run, not a
 * certification claim, and no row here should ever imply an external audit.
 */
export const POSTURE: PostureRow[] = [
  {
    framework: "SOC 2 Type II",
    status: "Not certified",
    detail: "Controls hardening underway. No Type I or Type II audit completed."
  },
  {
    framework: "ISO 27001",
    status: "Not certified",
    detail: "Annex A controls being implemented. No ISMS or third-party audit."
  },
  {
    framework: "HIPAA",
    status: "Not certified",
    detail: "Not intended for PHI workflows. BAA available on request."
  },
  {
    framework: "GDPR",
    status: "Controls operational",
    detail: "BehalfID acts as a data processor for developers using the service."
  },
  {
    framework: "CCPA / CPRA",
    status: "Controls operational",
    detail: "No sale or sharing of personal information."
  }
];
