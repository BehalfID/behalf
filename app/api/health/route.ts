import { noCacheJson } from "@/lib/responses";

export async function GET() {
  return noCacheJson({
    status: "ok",
    service: "behalfid",
    timestamp: new Date().toISOString()
  });
}
