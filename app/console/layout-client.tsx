"use client";

import { usePathname, useRouter } from "next/navigation";
import { ConsoleShellLayout } from "@/components/layout/ConsoleShell";

export function ConsoleLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/console/login") return children;

  const logout = async () => {
    await fetch("/api/console/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" }
    }).catch(() => undefined);
    router.push("/console/login");
  };

  return <ConsoleShellLayout onLogout={logout}>{children}</ConsoleShellLayout>;
}
