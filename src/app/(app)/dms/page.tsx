"use client";

import { useMobileNav } from "@/components/MobileNavContext";

// The actual list of DM conversations now lives in the sidebar column
// (DmListColumn, swapped in by Sidebar.tsx whenever you're in the DMs
// section) — this is just the "nothing selected yet" placeholder for the
// main pane, mirroring /c/page.tsx's idle state for regular channels.
export default function DmsIndexPage() {
  const { setOpen } = useMobileNav();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-line)] px-5 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
        >
          ☰
        </button>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-ink)]">
            Pick a conversation to start
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Choose a direct message from the list, or start a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
