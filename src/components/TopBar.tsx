"use client";

import { SearchBox } from "@/components/SearchBox";

// A persistent full-width bar above the rail/sidebar/main — search plus the
// current user's avatar. Deliberately doesn't fake browser back/forward or
// window traffic-light controls: this runs in a real browser that already
// provides those, and drawing fake ones would look broken, not authentic.
export function TopBar({ user }: { user: { name: string; image: string | null } }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 bg-[var(--color-nav-rail)] px-4">
      <div className="mx-auto w-full max-w-md">
        <SearchBox />
      </div>
      <div className="flex shrink-0 items-center">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={user.name} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}
