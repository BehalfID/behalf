import { BLOG_AUTHOR } from "@/lib/founders";
import type { PostMeta } from "./posts";

/**
 * Article structured data.
 *
 * Author is the organisation, matching the visible byline: posts here carry no
 * per-post author, and naming one founder in markup we cannot back up on the
 * page would be inventing attribution. The founders themselves are named on
 * /about and in the Organization schema there.
 */
export function articleJsonLd(post: PostMeta) {
  const url = `https://behalfid.com/blog/${post.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.excerpt,
    url,
    datePublished: post.date,
    dateModified: post.date,
    keywords: post.tags.join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: {
      "@type": "Organization",
      "@id": "https://behalfid.com/#organization",
      name: BLOG_AUTHOR,
      url: "https://behalfid.com/about"
    },
    publisher: { "@id": "https://behalfid.com/#organization" }
  };
}
