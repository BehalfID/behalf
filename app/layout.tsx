import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BehalfID",
  description: "Identity and permissions for AI agents."
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
