/**
 * Vercel agent-action route — using createBehalfIDHandler.
 *
 * Copy this file to your Next.js app at app/api/agent-action/route.ts.
 * The handler reads BEHALFID_API_KEY and BEHALFID_AGENT_ID from environment
 * variables and blocks any request that BehalfID denies.
 *
 * See examples/vercel-agent-route/README.md for setup and curl examples.
 */

import { NextResponse } from "next/server";
import { createBehalfIDHandler } from "@/integrations/vercel";

export const POST = createBehalfIDHandler({
  onAllowed: async (action, body) => {
    // Add your real action handlers here.
    // Return NextResponse to short-circuit, or null to use the default response.

    if (action === "send_email") {
      // await sendEmailHandler(body);
      return NextResponse.json({ sent: true, action });
    }

    if (action === "browse_web") {
      const url = typeof body.resource === "string" ? body.resource : "";
      // const html = await browseWebHandler(url);
      return NextResponse.json({ fetched: true, url });
    }

    // Unknown action — allowed by BehalfID but not handled locally.
    // Return null to fall through to the default 200 response.
    return null;
  },
});
