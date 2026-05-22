export type SiteGuardDecision = {
  allowed: boolean;
  reason: string;
  requestId: string;
  matchedRuleId: string | null;
  siteId: string | null;
};

export async function checkSiteGuard(input: {
  path: string;
  userAgent: string;
  agentIdentifier?: string;
}) {
  const baseUrl = process.env.BEHALFID_BASE_URL ?? "http://localhost:3000";
  const siteGuardKey = process.env.SITE_GUARD_KEY;

  if (!siteGuardKey) {
    throw new Error("SITE_GUARD_KEY is required. Create a site key from the Site Guard site detail page.");
  }

  const response = await fetch(`${baseUrl}/api/site-guard/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${siteGuardKey}`
    },
    body: JSON.stringify(input)
  });
  const decision = (await response.json()) as SiteGuardDecision | { error?: string };

  if (!response.ok) {
    throw new Error("error" in decision && decision.error ? decision.error : "Site Guard check failed.");
  }

  return decision as SiteGuardDecision;
}

export async function protectRoute(input: {
  path: string;
  userAgent: string;
  agentIdentifier?: string;
}) {
  const decision = await checkSiteGuard(input);
  if (!decision.allowed) {
    return new Response(decision.reason, { status: 403 });
  }

  return new Response("Protected route served after Site Guard allowed access.");
}
