import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "behalfid",
    timestamp: new Date().toISOString()
  });
}
