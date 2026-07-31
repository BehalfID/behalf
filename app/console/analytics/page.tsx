import type { Metadata } from "next";
import { ConsoleAnalyticsPage } from "./client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Analytics — BehalfID Console",
  description: "Platform-wide verification and growth analytics for BehalfID administrators."
};

export default async function Page() {
  await requireConsolePage();
  return <ConsoleAnalyticsPage />;
}
