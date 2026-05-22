import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...details }, { status });
}
