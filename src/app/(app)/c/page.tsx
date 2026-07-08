"use client";

import { useMobileNav } from "@/components/MobileNavContext";

export default function ChannelIndexPage() {
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
            Pick a channel to start
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Choose a channel from the sidebar, or create a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
