import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Settings — BehalfID Console",
  description: "Environment configuration, health checks, and known limitations.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="settings" />;
}
