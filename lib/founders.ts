/**
 * The founding team, used on /about and in Organization structured data.
 *
 * Only what we actually know goes in here. Names and roles are confirmed;
 * photos and personal social profiles are optional and currently unset, so
 * every consumer renders the founder card without them rather than showing an
 * empty avatar or a dead link.
 *
 * To add a photo: put the file in /public (e.g. /public/founders/jasper.jpg),
 * set `photo` to that path and write a one-sentence `photoAlt`.
 * To add a profile: set `linkedin` and/or `x` to the full URL.
 *
 * Do not add fields we cannot verify. A wrong or invented profile link on a
 * security vendor's about page is worse than an absent one.
 */

export type Founder = {
  name: string;
  /** Title as the person uses it. */
  role: string;
  /** Public path to a headshot in /public. Optional. */
  photo?: string;
  photoAlt?: string;
  /** Full profile URLs. Optional — omit rather than guess. */
  linkedin?: string;
  x?: string;
};

export const FOUNDERS: Founder[] = [
  { name: "Jasper Dragoo", role: "CEO" },
  { name: "Miles Magyar", role: "CTO" },
  { name: "Blake Bulls", role: "COO" }
];

/** Company contact shown on /about. */
export const COMPANY_EMAIL = "hello@behalfid.com";

/**
 * Company profiles already published in the site footer and social links.
 * These are the organisation's own accounts, not personal ones.
 */
export const COMPANY_PROFILES = [
  "https://x.com/behalfid",
  "https://linkedin.com/company/behalfid",
  "https://bsky.app/profile/official.behalfid.com",
  "https://github.com/behalfid/behalf"
];

/**
 * Blog byline.
 *
 * Posts in this repo carry no per-post author, so attributing them to one
 * founder would be inventing attribution. Add an `author` field to a post in
 * app/blog/posts.tsx and render that instead when a post genuinely has one.
 */
export const BLOG_AUTHOR = "The BehalfID team";

/** Schema.org Person entries for the founders — name and title only. */
export function founderPersonSchema() {
  return FOUNDERS.map((founder) => ({
    "@type": "Person" as const,
    name: founder.name,
    jobTitle: founder.role,
    ...(founder.linkedin || founder.x
      ? { sameAs: [founder.linkedin, founder.x].filter((value): value is string => Boolean(value)) }
      : {})
  }));
}
