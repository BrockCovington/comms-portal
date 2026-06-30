import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_WORKSPACE_NAME
    ? `${process.env.NEXT_PUBLIC_WORKSPACE_NAME} — Comms`
    : "Comms",
  description: "Internal team communication",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
