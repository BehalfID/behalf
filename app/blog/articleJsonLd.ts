import { FOUNDER, bylineName, isFounderNamed } from "@/lib/founder";
import type { PostMeta } from "./posts";

/**
 * Article structured data with a real author. Search and AI readers use the
 * author field to decide whether writing about enforcement models comes from a
 * person or from an anonymous vendor; the byline rendered on the page and this
 * markup are driven by the same source of truth.
 */
export function articleJsonLd(post: PostMeta) {
  const named = isFounderNamed();
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
    author: named
      ? {
          "@type": "Person",
          name: FOUNDER.name,
          jobTitle: FOUNDER.role,
          url: "https://behalfid.com/about",
          ...(FOUNDER.linkedin ? { sameAs: [FOUNDER.linkedin, FOUNDER.x].filter(Boolean) } : {})
        }
      : { "@type": "Organization", name: bylineName(), url: "https://behalfid.com/about" },
    publisher: { "@id": "https://behalfid.com/#organization" }
  };
}
