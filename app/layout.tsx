import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BehalfID - Identity and permissions for AI agents",
  description: "Verify whether an AI agent is allowed to act before the action happens."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
