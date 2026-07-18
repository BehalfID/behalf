import { ConsoleLayoutClient } from "./layout-client";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleLayoutClient>{children}</ConsoleLayoutClient>;
}
