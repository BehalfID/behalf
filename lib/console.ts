import { redirect } from "next/navigation";
import { hasConsoleSession } from "@/lib/adminAuth";

export async function requireConsolePage() {
  if (!(await hasConsoleSession())) {
    redirect("/console/login");
  }
}

export async function redirectAuthenticatedConsole() {
  if (await hasConsoleSession()) {
    redirect("/console");
  }
}
