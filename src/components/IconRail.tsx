"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPrefsPanel } from "@/components/NotificationPrefsPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { AppearancePanel } from "@/components/AppearancePanel";
import { Avatar } from "@/components/Avatar";
import {
  HomeIcon,
  DmsIcon,
  ActivityIcon,
  LaterIcon,
  FilesIcon,
  ToolsIcon,
  PlusIcon,
  MoreIcon,
} from "@/components/RailIcons";

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
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link href={href} className={railItemClass(active)} aria-label={label} title={label}>
      <span className="relative">
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
  user: { name: string; email: string; image: string | null };
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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

      <RailLink href="/c" active={pathname === "/c"} icon={<HomeIcon />} label="Home" />
      {/* Starting a new DM lives at /dms/new (NewDmView) — this points at
          the full list of ongoing DM conversations instead. */}
      <RailLink href="/dms" active={pathname === "/dms"} icon={<DmsIcon />} label="DMs" />
      <RailLink
        href="/activity"
        active={pathname === "/activity"}
        icon={<ActivityIcon />}
        label="Activity"
        badge={unreadCount}
      />
      <RailLink href="/later" active={pathname === "/later"} icon={<LaterIcon />} label="Later" />
      <RailLink href="/files" active={pathname === "/files"} icon={<FilesIcon />} label="Files" />
      <RailLink href="/admin" active={pathname === "/admin"} icon={<ToolsIcon />} label="Tools" />

      <button
        onClick={createChannel}
        disabled={creating}
        className={`${railItemClass(false)} disabled:opacity-50`}
        aria-label="Create channel"
        title="Create channel"
      >
        <PlusIcon />
        <span className="text-[10px] leading-none">New</span>
      </button>

      <div className="relative mt-auto">
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
            {/* Fixed, anchored just right of the rail: the rail is a narrow
                overflow-y-auto column, so an absolute menu centered on it
                spills off the left edge of the screen and gets clipped. */}
            <div className="fixed bottom-4 left-[5.5rem] z-50 w-44 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-left shadow-lg">
              <button
                onClick={() => { setMoreOpen(false); setNotifPrefsOpen(true); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
              >
                Notifications
              </button>
              <button
                onClick={() => { setMoreOpen(false); setAppearanceOpen(true); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
              >
                Appearance
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
        {appearanceOpen && <AppearancePanel onClose={() => setAppearanceOpen(false)} />}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={railItemClass(moreOpen)}
          aria-label="More"
          title="More"
        >
          <MoreIcon />
          <span className="text-[10px] leading-none">More</span>
        </button>
      </div>

      <div className="relative mt-1">
        {profileOpen && (
          <ProfilePanel
            name={user.name}
            email={user.email}
            image={user.image}
            onClose={() => setProfileOpen(false)}
          />
        )}
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="rounded-full ring-2 ring-transparent transition hover:ring-white/40"
          aria-label="Your profile"
          title="Your profile"
        >
          <Avatar name={user.name} image={user.image} size={32} variant="solid" />
        </button>
      </div>
    </aside>
  );
}
