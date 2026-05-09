import dns from "dns/promises";
import http, { type IncomingMessage } from "http";
import https from "https";
import { isPrivateIpAddress } from "@/lib/webhooks";

const GATEWAY_TIMEOUT_MS = 5_000;
const GATEWAY_MAX_RESPONSE_BYTES = 64 * 1024;
const GATEWAY_MAX_REDIRECTS = 3;
const TEXT_CONTENT_TYPES = [
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "text/"
];

export type GatewayFetchResult = {
  url: string;
  status: number;
  contentType: string;
  title: string | null;
  excerpt: string;
  truncated: boolean;
};

export async function fetchPublicWebRead(rawUrl: string): Promise<GatewayFetchResult> {
  let target = await validatePublicHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= GATEWAY_MAX_REDIRECTS; redirectCount += 1) {
    const response = await getPublicUrl(target);

    if (isRedirectStatus(response.status)) {
      const location = response.headers.location;
      response.body.resume();
      if (!location) {
        throw new Error("Gateway redirect did not include a Location header.");
      }
      if (redirectCount === GATEWAY_MAX_REDIRECTS) {
        throw new Error("Gateway redirect limit exceeded.");
      }
      target = await validatePublicHttpUrl(new URL(location, target.url).toString());
      continue;
    }

    const contentType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
    const isText = isTextContentType(contentType);
    if (!isText) response.body.resume();
    const { body, truncated } = isText && response.body
      ? await readResponseTextWithLimit(response.body, GATEWAY_MAX_RESPONSE_BYTES)
      : { body: "", truncated: false };

    return {
      url: target.url.toString(),
      status: response.status,
      contentType,
      title: isText ? extractTitle(body) : null,
      excerpt: isText ? normalizeExcerpt(body) : "",
      truncated
    };
  }

  throw new Error("Gateway redirect limit exceeded.");
}

async function validatePublicHttpUrl(value: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("input.url is required.");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("input.url must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Gateway only supports http:// and https:// URLs.");
  }

  if (url.username || url.password) {
    throw new Error("Gateway URLs must not include credentials.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (isInternalHostname(hostname)) {
    throw new Error("Gateway URL host is not public.");
  }

  if (isPrivateIpAddress(hostname)) {
    throw new Error("Gateway URL IP address is not public.");
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) {
    throw new Error("Gateway URL host could not be resolved.");
  }

  if (addresses.some((address) => isPrivateIpAddress(address.address))) {
    throw new Error("Gateway URL resolves to a non-public address.");
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  return { url, addresses };
}

type ValidatedTarget = Awaited<ReturnType<typeof validatePublicHttpUrl>>;

async function getPublicUrl(target: ValidatedTarget) {
  const client = target.url.protocol === "https:" ? https : http;
  const pinnedAddress = target.addresses[0];

  return new Promise<{
    status: number;
    headers: IncomingMessage["headers"];
    body: IncomingMessage;
  }>((resolve, reject) => {
    const request = client.request(
      target.url,
      {
        method: "GET",
        timeout: GATEWAY_TIMEOUT_MS,
        headers: {
          Accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.1",
          "User-Agent": "BehalfID-Action-Gateway/0.1"
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress.address, pinnedAddress.family);
        }
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Gateway fetch timed out."));
    });
    request.on("error", (error) => {
      reject(error.message === "Gateway fetch timed out." ? error : new Error("Gateway fetch failed."));
    });
    request.end();
  });
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isInternalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    !hostname.includes(".")
  );
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

function isTextContentType(contentType: string) {
  return TEXT_CONTENT_TYPES.some((allowed) =>
    allowed.endsWith("/") ? contentType.startsWith(allowed) : contentType === allowed
  );
}

async function readResponseTextWithLimit(response: IncomingMessage, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for await (const value of response) {
    const chunk = value instanceof Buffer ? value : Buffer.from(value);
    const remaining = maxBytes - total;
    if (chunk.byteLength > remaining) {
      chunks.push(chunk.subarray(0, Math.max(remaining, 0)));
      truncated = true;
      response.destroy();
      break;
    }

    chunks.push(chunk);
    total += chunk.byteLength;
  }

  return { body: new TextDecoder().decode(concatChunks(chunks)), truncated };
}

function concatChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function extractTitle(body: string) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return decodeHtml(match[1]).replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function normalizeExcerpt(body: string) {
  const withoutScripts = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = decodeHtml(withoutScripts.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 4_000);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}
