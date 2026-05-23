import { NextResponse } from "next/server";

/**
 * Bluesky / AT Protocol handle verification endpoint.
 *
 * Bluesky verifies custom-domain handles by fetching:
 *   GET https://<domain>/.well-known/atproto-did
 *
 * The response must be the bare DID string (plain text, no trailing newline
 * required but harmless).
 *
 * See: https://atproto.com/specs/handle#handle-resolution
 */
export async function GET() {
  return new NextResponse("did:plc:oqqwzx6zmleknryhbwd5tckt", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      // Allow Bluesky's servers to fetch this cross-origin
      "Access-Control-Allow-Origin": "*"
    }
  });
}
