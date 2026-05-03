import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BehalfID - Permission passports for AI agents",
  description: "Connect agents, define permissions, and verify actions before they happen.",
  icons: {
    icon: "/behalf_symbols.png",
    apple: "/behalf_symbols.png"
  }
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
