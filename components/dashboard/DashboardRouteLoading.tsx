"use client";

import { usePathname } from "next/navigation";
import { PageLoadingState } from "@/components/ui";
import { getDashboardLoadingVariant } from "@/lib/dashboardShellPresentation";

export function DashboardRouteLoading({ label = "Loading workspace content" }: { label?: string }) {
  const pathname = usePathname();
  return <PageLoadingState label={label} variant={getDashboardLoadingVariant(pathname)} />;
}
