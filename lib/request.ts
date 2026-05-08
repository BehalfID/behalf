import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/responses";
import { isRecord, type JsonRecord } from "@/lib/validation";

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

type ReadJsonOptions = {
  maxBytes?: number;
};

type ReadJsonResult = {
  body: JsonRecord | null;
  error: NextResponse | null;
};

export async function readJsonObject(
  request: NextRequest,
  { maxBytes = DEFAULT_MAX_JSON_BYTES }: ReadJsonOptions = {}
): Promise<ReadJsonResult> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return { body: null, error: jsonError("Content-Type must be application/json.", 415) };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { body: null, error: jsonError("Request body is too large.", 413) };
  }

  const raw = await readBodyWithLimit(request, maxBytes);
  if (raw === null) {
    return { body: null, error: jsonError("Request body is too large.", 413) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { body: null, error: jsonError("Request body must be valid JSON.") };
  }

  if (!isRecord(parsed)) {
    return { body: null, error: jsonError("Request body must be a JSON object.") };
  }

  return { body: parsed, error: null };
}

async function readBodyWithLimit(request: NextRequest, maxBytes: number) {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}
