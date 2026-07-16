"use client";

import { SearchBox } from "@/components/SearchBox";
import { Avatar } from "@/components/Avatar";

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
        <Avatar name={user.name} image={user.image} size={28} variant="solid" />
      </div>
    </div>
  );
}
