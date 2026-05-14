import type { MetadataRoute } from "next";

const baseUrl = "https://behalfid.com";
const lastModified = new Date("2026-05-08T00:00:00.000Z");

const routes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.88 },
  { path: "/blog/the-decision-packet", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog/fail-closed-agent-enforcement", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog/permission-passports-not-api-keys", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog/connected-vs-native-agents", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog/webhooks-as-agent-audit-layer", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog/requires-approval-pattern", changeFrequency: "monthly", priority: 0.75 },
  { path: "/sandbox", changeFrequency: "weekly", priority: 0.85 },
  { path: "/security", changeFrequency: "monthly", priority: 0.85 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/docs/quickstart", changeFrequency: "weekly", priority: 0.85 },
  { path: "/docs/api", changeFrequency: "weekly", priority: 0.85 },
  { path: "/docs/sdk", changeFrequency: "weekly", priority: 0.85 },
  { path: "/docs/action-gateway", changeFrequency: "weekly", priority: 0.84 },
  { path: "/docs/webhooks", changeFrequency: "monthly", priority: 0.78 },
  { path: "/docs/site-guard", changeFrequency: "monthly", priority: 0.76 },
  { path: "/docs/concepts", changeFrequency: "monthly", priority: 0.8 },
  { path: "/login", changeFrequency: "yearly", priority: 0.35 },
  { path: "/signup", changeFrequency: "monthly", priority: 0.65 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
}
