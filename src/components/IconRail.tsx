"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPrefsPanel } from "@/components/NotificationPrefsPanel";

function railItemClass(active: boolean) {
  return `flex w-16 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition ${
    active
      ? "bg-white/20 text-white"
      : "text-[var(--color-on-sidebar-dim)] hover:bg-white/10 hover:text-white"
  }`;
}

function RailLink({
  href,
  active,
  icon,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <Link href={href} className={railItemClass(active)} aria-label={label} title={label}>
      <span className="relative text-lg leading-none">
        {icon}
        {!!badge && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] leading-none">{label}</span>
    </Link>
  );
}

export function IconRail({
  workspaceName,
  currentUserId,
  user,
  signOutAction,
}: {
  workspaceName: string;
  currentUserId: string;
  user: { name: string; image: string | null };
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Just the badge count, not the dropdown — Activity is now a full page
  // (src/app/(app)/activity/page.tsx), this hook call only drives the
  // unread number shown on the rail icon.
  const { unreadCount } = useNotifications(currentUserId);

  // Same create-channel action the sidebar's own "+" already performs —
  // duplicated here (not lifted/shared) since it's this small and fully
  // self-contained, matching how e.g. pusherChannelName() is duplicated
  // per-hook elsewhere in this app rather than prop-drilled.
  async function createChannel() {
    const raw = window.prompt("New channel name (lowercase, hyphens):");
    if (!raw) return;
    const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
    setCreating(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/c/${data.channel.id}`);
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-[var(--color-nav-rail)] py-3">
      <Link
        href="/c"
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
        aria-label={workspaceName}
        title={workspaceName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/syndica-icon.svg" alt="" className="h-7 w-7" />
      </Link>

      <RailLink href="/c" active={pathname === "/c"} icon="🏠" label="Home" />
      {/* Starting a new DM lives at /dms/new (NewDmView) — this points at
          the full list of ongoing DM conversations instead. */}
      <RailLink href="/dms" active={pathname === "/dms"} icon="💬" label="DMs" />
      <RailLink
        href="/activity"
        active={pathname === "/activity"}
        icon="🔔"
        label="Activity"
        badge={unreadCount}
      />
      <RailLink href="/later" active={pathname === "/later"} icon="🔖" label="Later" />
      <RailLink href="/files" active={pathname === "/files"} icon="📁" label="Files" />
      <RailLink href="/admin" active={pathname === "/admin"} icon="🛠️" label="Tools" />

      <button
        onClick={createChannel}
        disabled={creating}
        className={`${railItemClass(false)} disabled:opacity-50`}
        aria-label="Create channel"
        title="Create channel"
      >
        <span className="text-lg leading-none">+</span>
        <span className="text-[10px] leading-none">New</span>
      </button>

      <div className="relative mt-auto">
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-full left-1/2 z-50 mb-1 w-40 -translate-x-1/2 rounded-md border border-[var(--color-line)] bg-white p-1 text-left shadow-lg">
              <button
                onClick={() => { setMoreOpen(false); setNotifPrefsOpen(true); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
              >
                Notifications
              </button>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
        {notifPrefsOpen && <NotificationPrefsPanel onClose={() => setNotifPrefsOpen(false)} />}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={railItemClass(moreOpen)}
          aria-label="More"
          title="More"
        >
          <span className="text-lg leading-none">•••</span>
          <span className="text-[10px] leading-none">More</span>
        </button>
      </div>

      <div className="mt-1">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </aside>
  );
}
