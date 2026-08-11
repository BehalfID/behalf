/**
 * Real, named customer quotes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACTION REQUIRED — this list is intentionally empty.
 *
 * The site audit's single most damaging trust gap (D3.2) is that the only named
 * people on the site — Maya Okafor, Jonas Beck — are illustrative demo
 * characters. Nothing here is filled in with plausible-sounding placeholders on
 * purpose: a fabricated testimonial on a security product is worse than none.
 *
 * Collect 3–5 quotes from real design partners or beta users. Each one needs:
 *
 *   name     — first name at minimum, as they agreed to be quoted.
 *   role     — job title, and company if they will let you name it.
 *   quote    — their words, not yours. The audit is explicit that a *specific
 *              outcome* is what converts: "we caught a production deploy the
 *              agent shouldn't have made in week one" beats "great product".
 *   photo    — a real face. Put the file in /public and reference its path.
 *   photoAlt — one sentence describing the photo.
 *
 * Every surface below renders nothing at all while the list is empty:
 *   - the homepage testimonial wall (components/marketing/TestimonialWall.tsx)
 *   - the /design-partners "who is already using this" section
 *
 * Add entries here and both light up. No other file needs to change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  photo?: string;
  photoAlt?: string;
};

export const TESTIMONIALS: Testimonial[] = [];

export function hasTestimonials(): boolean {
  return TESTIMONIALS.length > 0;
}
