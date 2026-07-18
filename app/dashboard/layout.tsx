import { DashboardShellLayout } from "@/components/layout/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShellLayout>{children}</DashboardShellLayout>;
}
