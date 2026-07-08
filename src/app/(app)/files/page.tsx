"use client";

import { useMobileNav } from "@/components/MobileNavContext";

// The actual files list now lives in the sidebar column (FilesListColumn,
// swapped in by Sidebar.tsx while on /files) — this is just the "nothing
// selected yet" placeholder for the main pane.
export default function FilesIndexPage() {
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
          <p className="text-sm font-medium text-[var(--color-ink)]">Pick a file to open</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Choose a file from the list, or jump to its channel.
          </p>
        </div>
      </div>
    </div>
  );
}
