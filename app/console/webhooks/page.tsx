import type { Metadata } from "next";
import { requireConsolePage } from "@/lib/console";
import { ConsolePage } from "../client";

export const metadata: Metadata = {
  title: "Webhooks — BehalfID Console",
  description: "Manage webhook endpoints and event subscriptions.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="webhooks" />;
}
