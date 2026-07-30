import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { StatusBoard } from "@/components/status/StatusBoard";
import { getSystemStatus } from "@/lib/statusHealth";

export const metadata: Metadata = {
  title: "System Status — BehalfID",
  description: "Live status of BehalfID services, components, and recent incidents.",
  alternates: { canonical: "/status" }
};

// Health must be measured per request. A cached status page can report
// "operational" for up to a minute after a dependency has failed.
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const status = await getSystemStatus();

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />
      <StatusBoard status={status} />
      <PublicFooter />
    </main>
  );
}
