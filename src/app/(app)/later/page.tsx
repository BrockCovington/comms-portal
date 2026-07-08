"use client";

import { useMobileNav } from "@/components/MobileNavContext";

// The actual saved-messages list now lives in the sidebar column
// (LaterListColumn, swapped in by Sidebar.tsx while on /later) — this is
// just the "nothing selected yet" placeholder for the main pane.
export default function LaterIndexPage() {
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
          <p className="text-sm font-medium text-[var(--color-ink)]">Pick a saved message to view</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Choose one from the list, or save a message from any channel.
          </p>
        </div>
      </div>
    </div>
  );
}
