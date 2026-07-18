"use client";

import { usePathname } from "next/navigation";
import { PageLoadingState, type PageLoadingVariant } from "@/components/ui";

function consoleLoadingVariant(pathname: string): PageLoadingVariant {
  if (pathname === "/console") return "overview";
  if (/^\/console\/(agents|webhooks|webhook-events)\/[^/]+$/.test(pathname)) return "detail";
  if (pathname === "/console/settings" || pathname === "/console/status") return "settings";
  if (pathname === "/console/logs") return "activity";
  return "table";
}

export default function ConsoleLoading() {
  const pathname = usePathname();
  return <PageLoadingState label="Loading console content" variant={consoleLoadingVariant(pathname)} />;
}
