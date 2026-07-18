"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPrefsPanel } from "@/components/NotificationPrefsPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { AppearancePanel } from "@/components/AppearancePanel";
import { Avatar } from "@/components/Avatar";
import { useHuddleControls } from "@/components/HuddleProvider";
import {
  HomeIcon,
  DmsIcon,
  ActivityIcon,
  LaterIcon,
  FilesIcon,
  GearIcon,
  UsersIcon,
  ArchiveIcon,
  PlusIcon,
  MoonIcon,
  PencilIcon,
  HashIcon,
  HeadphonesIcon,
  CanvasIcon,
  ListIcon,
  WorkflowIcon,
  InvitePeopleIcon,
} from "@/components/RailIcons";

// A far-future sentinel: focus mode pauses notifications indefinitely (until
// toggled off), reusing the same dndUntil field as timed snooze.
const FOCUS_FOREVER = "2999-12-31T00:00:00.000Z";

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
  role,
  signOutAction,
}: {
  workspaceName: string;
  currentUserId: string;
  user: { name: string; email: string; image: string | null };
  role: "EMPLOYEE" | "ADMIN";
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { startOrJoin } = useHuddleControls();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTop, setAdminTop] = useState(0);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // The channel currently open (if any) — lets "Create → Huddle" start one in
  // context; otherwise it drops you at home to pick a conversation first.
  const currentChannelId = pathname?.startsWith("/c/") ? pathname.slice(3) : null;

  async function createCanvas() {
    setCreateOpen(false);
    const res = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled canvas", body: "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) router.push(`/canvas/${data.id}`);
  }

  async function createList() {
    setCreateOpen(false);
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled list" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) router.push(`/lists/${data.id}`);
  }

  // A workflow needs a channel + schedule up front, so (unlike Canvas/List)
  // this opens the builder rather than creating an empty record first.
  function createWorkflow() {
    setCreateOpen(false);
    router.push("/workflows/new");
  }

  function startHuddle() {
    setCreateOpen(false);
    if (currentChannelId) startOrJoin(currentChannelId, "Huddle");
    else router.push("/c");
  }

  function invitePeople() {
    setCreateOpen(false);
    window.alert(
      "Teammates join by signing in with their company Google account — no invite needed. Sign-in is locked to your company domain."
    );
  }

  // Focus mode = Do Not Disturb. Reads the current dndUntil so the moon also
  // reflects a timed snooze set from the Notifications panel; toggling on sets
  // it indefinitely, off clears it. All the actual suppression (notification
  // pushes, incoming-huddle ring) already keys off dndUntil server-side.
  const [dndUntil, setDndUntil] = useState<string | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const focusOn = !!dndUntil && new Date(dndUntil).getTime() > Date.now();

  useEffect(() => {
    fetch("/api/notification-preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDndUntil(d.dndUntil ?? null); })
      .catch(() => {});
  }, []);

  async function toggleFocus() {
    if (focusBusy) return;
    setFocusBusy(true);
    const next = focusOn ? null : FOCUS_FOREVER;
    setDndUntil(next); // optimistic
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dndUntil: next }),
      });
      if (res.ok) {
        const d = await res.json();
        setDndUntil(d.dndUntil ?? null);
      }
    } catch {
      // Best-effort — leave the optimistic value; a reload re-syncs.
    } finally {
      setFocusBusy(false);
    }
  }
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
      <RailLink href="/files" active={pathname === "/files"} icon={<FilesIcon />} label="Files" />
      <RailLink href="/later" active={pathname === "/later"} icon={<LaterIcon />} label="Later" />

      {role === "ADMIN" && (
        <div className="relative">
          {adminOpen && (
            <AdminToolsMenu
              top={adminTop}
              onClose={() => setAdminOpen(false)}
              onNavigate={(href) => { setAdminOpen(false); router.push(href); }}
            />
          )}
          <button
            onClick={(e) => {
              setAdminTop(e.currentTarget.getBoundingClientRect().top);
              setAdminOpen((v) => !v);
            }}
            className={railItemClass((pathname?.startsWith("/admin") ?? false) || adminOpen)}
            aria-label="Admin"
            title="Admin"
          >
            <GearIcon />
            <span className="text-[10px] leading-none">Admin</span>
          </button>
        </div>
      )}

      {/* Bottom cluster: Create, Focus, and the profile avatar — circular. */}
      <div className="relative mt-auto flex flex-col items-center gap-3 pt-4">
        {createOpen && (
          <CreateMenu
            onClose={() => setCreateOpen(false)}
            onMessage={() => { setCreateOpen(false); router.push("/dms/new"); }}
            onChannel={() => { setCreateOpen(false); createChannel(); }}
            onHuddle={startHuddle}
            onCanvas={createCanvas}
            onList={createList}
            onWorkflow={createWorkflow}
            onInvite={invitePeople}
          />
        )}
        <button
          onClick={() => setCreateOpen((v) => !v)}
          disabled={creating}
          aria-label="Create"
          title="Create"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition disabled:opacity-50 ${
            createOpen ? "bg-white/20 text-white" : "bg-white/10 text-[var(--color-on-sidebar-dim)] hover:bg-white/20 hover:text-white"
          }`}
        >
          <PlusIcon className="h-5 w-5" />
        </button>

        <button
          onClick={toggleFocus}
          disabled={focusBusy}
          aria-label={focusOn ? "Turn off focus mode" : "Turn on focus mode"}
          title={focusOn ? "Focus mode on — notifications paused" : "Focus mode — pause notifications"}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition disabled:opacity-50 ${
            focusOn ? "bg-white/20 text-white" : "bg-white/10 text-[var(--color-on-sidebar-dim)] hover:bg-white/20 hover:text-white"
          }`}
        >
          <MoonIcon className="h-5 w-5" />
        </button>

        <div className="relative">
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              {/* Fixed, anchored just right of the rail: the rail is a narrow
                  overflow-y-auto column, so an absolute menu centered on it
                  spills off the left edge of the screen and gets clipped. */}
              <div className="fixed bottom-4 left-[5.5rem] z-50 w-56 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-left shadow-lg">
                <div className="border-b border-[var(--color-line)] px-2 py-2">
                  <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{user.name}</p>
                  <p className="truncate text-xs text-[var(--color-ink-soft)]">{user.email}</p>
                </div>
                <button
                  onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                >
                  Profile
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); setNotifPrefsOpen(true); }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                >
                  Notifications
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); setAppearanceOpen(true); }}
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
          {profileOpen && (
            <ProfilePanel
              name={user.name}
              email={user.email}
              image={user.image}
              onClose={() => setProfileOpen(false)}
            />
          )}
          {notifPrefsOpen && <NotificationPrefsPanel onClose={() => setNotifPrefsOpen(false)} />}
          {appearanceOpen && <AppearancePanel onClose={() => setAppearanceOpen(false)} />}
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="relative rounded-full ring-2 ring-transparent transition hover:ring-white/40"
            aria-label="Your profile and settings"
            title={focusOn ? "You — focus mode on" : "You"}
          >
            <Avatar name={user.name} image={user.image} size={36} variant="solid" />
            {focusOn && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--color-nav-rail)] bg-[var(--color-accent)]"
                title="Focus mode on"
              >
                <MoonIcon className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

function CreateRow({
  icon,
  color,
  title,
  subtitle,
  soon,
  onClick,
}: {
  icon: React.ReactNode;
  color?: string;
  title: string;
  subtitle: string;
  soon?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--color-accent-soft)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color ? "text-white" : "text-[var(--color-ink-soft)]"}`}
        style={color ? { backgroundColor: color } : undefined}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          {title}
          {soon && (
            <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
              Soon
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-[var(--color-ink-soft)]">{subtitle}</span>
      </span>
    </button>
  );
}

// The "Admin Tools" pop-out (admins only), anchored to the right of the rail
// at the gear button's vertical position.
function AdminToolsMenu({
  top,
  onClose,
  onNavigate,
}: {
  top: number;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed left-[5.5rem] z-50 w-72 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[var(--color-ink)] shadow-xl"
        style={{ top }}
      >
        <p className="px-2 py-1 text-sm font-semibold">Admin Tools</p>
        <CreateRow
          icon={<UsersIcon className="h-4 w-4" />}
          color="#3675f8"
          title="Members & roles"
          subtitle="Grant or revoke admin access"
          onClick={() => onNavigate("/admin/users")}
        />
        <CreateRow
          icon={<ArchiveIcon className="h-4 w-4" />}
          color="#84848a"
          title="Channels"
          subtitle="Archive or reopen channels"
          onClick={() => onNavigate("/admin/channels")}
        />
      </div>
    </>
  );
}

function CreateMenu({
  onClose,
  onMessage,
  onChannel,
  onHuddle,
  onCanvas,
  onList,
  onWorkflow,
  onInvite,
}: {
  onClose: () => void;
  onMessage: () => void;
  onChannel: () => void;
  onHuddle: () => void;
  onCanvas: () => void;
  onList: () => void;
  onWorkflow: () => void;
  onInvite: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-4 left-[5.5rem] z-50 w-80 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[var(--color-ink)] shadow-xl">
        <p className="px-2 py-1 text-sm font-semibold">Create</p>
        <CreateRow
          icon={<PencilIcon className="h-4 w-4" />}
          color="#7c00dd"
          title="Message"
          subtitle="Start a conversation in a DM or channel"
          onClick={onMessage}
        />
        <CreateRow
          icon={<HashIcon className="h-4 w-4" />}
          color="#84848a"
          title="Channel"
          subtitle="Start a group conversation by topic"
          onClick={onChannel}
        />
        <CreateRow
          icon={<HeadphonesIcon className="h-4 w-4" />}
          color="#16a06b"
          title="Huddle"
          subtitle="Start a video or audio chat"
          onClick={onHuddle}
        />
        <CreateRow
          icon={<CanvasIcon className="h-4 w-4" />}
          color="#3675f8"
          title="Canvas"
          subtitle="Create and share content"
          onClick={onCanvas}
        />
        <CreateRow
          icon={<ListIcon className="h-4 w-4" />}
          color="#b7791f"
          title="List"
          subtitle="Track and manage projects"
          onClick={onList}
        />
        <CreateRow
          icon={<WorkflowIcon className="h-4 w-4" />}
          color="#b91c1c"
          title="Workflow"
          subtitle="Automate everyday tasks"
          onClick={onWorkflow}
        />
        <div className="my-1 border-t border-[var(--color-line)]" />
        <CreateRow
          icon={<InvitePeopleIcon className="h-5 w-5" />}
          title="Invite people"
          subtitle="How teammates join the workspace"
          onClick={onInvite}
        />
      </div>
    </>
  );
}
