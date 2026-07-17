"use client";

import { SearchBox } from "@/components/SearchBox";
import { Avatar } from "@/components/Avatar";

// A persistent full-width bar above the rail/sidebar/main: search on the left,
// the "Syndica Sync" brand centered, and the current user's avatar on the
// right. A 3-column grid keeps the brand truly centered regardless of the side
// widths. Deliberately doesn't fake browser back/forward or window controls —
// this runs in a real browser that already provides those.
export function TopBar({ user }: { user: { name: string; image: string | null } }) {
  return (
    <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 bg-[var(--color-nav-rail)] px-4">
      <div className="w-full max-w-sm justify-self-start">
        <SearchBox />
      </div>

      <div className="flex items-center gap-2 justify-self-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/syndica-icon.svg" alt="" className="h-6 w-6" />
        <span className="text-sm font-semibold tracking-tight text-white">
          Syndica <span className="text-[var(--color-accent)]">Sync</span>
        </span>
      </div>

      <div className="flex items-center justify-self-end">
        <Avatar name={user.name} image={user.image} size={28} variant="solid" />
      </div>
    </div>
  );
}
