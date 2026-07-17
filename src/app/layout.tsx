import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import {
  COLOR_MODE_COOKIE,
  COLOR_THEME_COOKIE,
  DEFAULT_COLOR_MODE,
  DEFAULT_COLOR_THEME,
  isColorMode,
  isColorTheme,
} from "@/lib/themes";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_WORKSPACE_NAME
    ? `${process.env.NEXT_PUBLIC_WORKSPACE_NAME} — Comms`
    : "Comms",
  description: "Internal team communication",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The appearance preference lives in a cookie so it can be applied here,
  // server-side, before first paint — no theme flash. Validated against the
  // known sets so only expected values ever reach the DOM attributes.
  const jar = await cookies();
  const modeRaw = jar.get(COLOR_MODE_COOKIE)?.value;
  const themeRaw = jar.get(COLOR_THEME_COOKIE)?.value;
  const mode = isColorMode(modeRaw) ? modeRaw : DEFAULT_COLOR_MODE;
  const theme = isColorTheme(themeRaw) ? themeRaw : DEFAULT_COLOR_THEME;

  return (
    <html lang="en" data-color-mode={mode} data-theme={theme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
