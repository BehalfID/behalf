import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Site Guard — BehalfID Console",
  description: "View all sites, rules, and recent site-guard check logs.",
};

export default async function ConsoleSiteGuardPage() {
  await requireConsolePage();
  return <ConsolePage view="site-guard" />;
}
