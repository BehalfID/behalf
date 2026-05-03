import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { DashboardShell } from "./client";

export async function ProtectedDashboard({ view, id }: { view: "home" | "agents" | "agent" | "webhooks" | "webhook" | "logs" | "docs" | "settings"; id?: string }) {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  return <DashboardShell view={view} id={id} />;
}
