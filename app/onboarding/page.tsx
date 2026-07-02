import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { connectToDatabase } from "@/lib/db";
import DeveloperUser from "@/models/DeveloperUser";
import { AccountSetupClient } from "./client";

export const metadata: Metadata = {
  title: "Account setup — BehalfID", // pragma: allowlist secret
};

export default async function OnboardingPage() {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");

  await connectToDatabase();
  const fullUser = await DeveloperUser.findOne({ userId: user.userId })
    .select("onboardingCompletedAt")
    .lean();
  if (fullUser?.onboardingCompletedAt) redirect("/dashboard");

  return <AccountSetupClient emailVerified={user.emailVerified !== false} />;
}
