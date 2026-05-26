import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { DashboardShell } from "./client";

export async function ProtectedDashboard({ view, id }: { view: "home" | "onboarding" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "docs" | "settings"; id?: string }) {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  return <DashboardShell view={view} id={id} />;
}
