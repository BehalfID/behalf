/**
 * Founder identity used on /about and as the byline on blog posts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACTION REQUIRED — fill these four values in.
 *
 * The site audit flagged vendor anonymity as a top-of-list trust gap (D3.3):
 * a security-owner buyer will not put a runtime control in their execution path
 * for an unnamed vendor that describes itself as a prototype. A real name, a
 * real face and a real LinkedIn are the fix.
 *
 *   1. `name`      — the founder's real name, as they want it published.
 *   2. `role`      — e.g. "Founder" or "Founder & engineer".
 *   3. `photo`     — drop a headshot in /public (e.g. /public/founder.jpg) and
 *                    put the public path here. A plain, well-lit photo beats a
 *                    stylised one; a real face is the point.
 *   4. `photoAlt`  — one sentence describing the photo.
 *   5. `linkedin`  — full profile URL.
 *   6. `x`         — full profile URL, or leave "" to hide the link.
 *
 * Nothing here is invented on purpose. Every consumer below degrades to a
 * neutral, non-embarrassing state while the fields are blank — but /about will
 * keep failing the audit's D3.3 check until they are filled in.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type Founder = {
  name: string;
  role: string;
  /** Public path to a headshot in /public, e.g. "/founder.jpg". */
  photo: string;
  photoAlt: string;
  linkedin: string;
  x: string;
  email: string;
};

export const FOUNDER: Founder = {
  name: "",
  role: "Founder",
  photo: "",
  photoAlt: "",
  linkedin: "",
  x: "",
  email: "hello@behalfid.com"
};

/** True once the founder is actually named — gates the named-vendor UI. */
export function isFounderNamed(): boolean {
  return FOUNDER.name.trim().length > 0;
}

/** Byline shown on blog posts. Falls back to the company while unnamed. */
export function bylineName(): string {
  return isFounderNamed() ? FOUNDER.name : "The BehalfID team";
}
