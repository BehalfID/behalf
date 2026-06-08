import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Action Inbox — BehalfID",
  description: "Review pending approvals and recent high-risk denied actions.",
};

export default function InboxPage() {
  return <ProtectedDashboard view="inbox" />;
}
