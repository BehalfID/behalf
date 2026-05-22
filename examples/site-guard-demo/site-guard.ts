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
  const developerToken = process.env.BEHALFID_DEVELOPER_TOKEN;
  const siteId = process.env.BEHALFID_SITE_ID;

  if (!developerToken || !siteId) {
    throw new Error("BEHALFID_DEVELOPER_TOKEN and BEHALFID_SITE_ID are required.");
  }

  const response = await fetch(`${baseUrl}/api/site-guard/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-developer-token": developerToken
    },
    body: JSON.stringify({ siteId, ...input })
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
