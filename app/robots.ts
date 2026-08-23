import type { MetadataRoute } from "next";
import { canonicalOrigin } from "@/lib/canonicalOrigin";

/**
 * OpenAI's ChatGPT ads crawler. It fetches the landing pages behind ChatGPT ad
 * placements to check them against OpenAI's ad policies, and it matches its own
 * robots.txt token rather than falling back to "*", so it needs an explicit
 * group here. OpenAI's advertiser guidance requires that this agent reach every
 * page an ad points at:
 * https://help.openai.com/en/articles/20001243-advertiser-guidance-for-allowing-openai-web-crawlers
 *
 * Note that a user-agent group with its own rules does NOT inherit the "*"
 * group, so any path added to the wildcard disallow list below must be repeated
 * in this group to keep the two in sync.
 */
export const OPENAI_ADS_USER_AGENT = "OAI-AdsBot";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/design-system/foundation"
      },
      {
        userAgent: OPENAI_ADS_USER_AGENT,
        allow: "/",
        disallow: "/design-system/foundation"
      }
    ],
    // Must name the same origin the sitemap itself advertises, and an origin
    // that actually serves — a crawler that cannot fetch this treats the site
    // as having no sitemap at all.
    sitemap: `${canonicalOrigin()}/sitemap.xml`
  };
}
