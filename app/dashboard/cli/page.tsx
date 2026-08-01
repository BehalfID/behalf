import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "CLI — BehalfID",
  description: "Run BehalfID CLI commands from the browser terminal."
};

export default function CliPage() {
  return <ProtectedDashboard view="cli" />;
}
