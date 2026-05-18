import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { OnboardingClient } from "./client";

export const metadata: Metadata = {
  title: "Welcome — BehalfID",
};

export default async function OnboardingPage() {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  return <OnboardingClient />;
}
