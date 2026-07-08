"use client";

import { useState } from "react";
import { MobileNavProvider } from "@/components/MobileNavContext";

// Owns the mobile-nav open/close state and lays out the top bar, icon rail,
// sidebar, and main column. Exists as a client component so
// `src/app/(app)/layout.tsx` can stay a server component (it does the auth
// check + Prisma query) while still giving descendants — like the hamburger
// button in ChannelView's header — a way to reach this toggle via context.
export function AppShell({
  topBar,
  rail,
  sidebar,
  children,
}: {
  topBar: React.ReactNode;
  rail: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MobileNavProvider value={{ open, setOpen }}>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {topBar}
        <div className="flex min-h-0 flex-1">
          <div className="hidden md:flex">{rail}</div>
          {sidebar}
          <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-canvas)]">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
