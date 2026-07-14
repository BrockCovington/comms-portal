"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";
import { useMobileNav } from "@/components/MobileNavContext";
import { BrowseChannelsPanel } from "@/components/BrowseChannelsPanel";
import { DmListColumn } from "@/components/DmListColumn";
import { ThreadListColumn } from "@/components/ThreadListColumn";
import { LaterListColumn } from "@/components/LaterListColumn";
import { DraftsListColumn } from "@/components/DraftsListColumn";
import { FilesListColumn } from "@/components/FilesListColumn";
import { ActivityListColumn } from "@/components/ActivityListColumn";
import type { DmThreadSummary } from "@/lib/dms";
import type { ThreadSummary } from "@/lib/threads";
import type { SavedMessageSummary } from "@/lib/saved";
import type { DraftSummary } from "@/lib/drafts";
import type { FileSummary } from "@/lib/files";

function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

type Channel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
  hasUnread: boolean;
  isStarred?: boolean;
  muted?: boolean;
  archivedAt?: string | Date | null;
};

export function Sidebar({
  channels,
  dmThreads,
  threads,
  savedMessages,
  drafts,
  files,
  currentUserId,
}: {
  channels: Channel[];
  dmThreads: DmThreadSummary[];
  threads: ThreadSummary[];
  savedMessages: SavedMessageSummary[];
  drafts: DraftSummary[];
  files: FileSummary[];
  currentUserId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const { open, setOpen } = useMobileNav();

  const activeChannelId = pathname?.startsWith("/c/") ? pathname.slice("/c/".length) : null;
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  // The DMs section gets its own dedicated column (DmListColumn) instead of
  // the normal channel sidebar — both when landing on /dms itself, and while
  // an actual DM conversation is open, so it stays put as you click between
  // conversations rather than reverting to the regular sidebar.
  const inDmContext = pathname?.startsWith("/dms") || !!activeChannel?.isDm;
  // Threads/Later/Files/Drafts/Activity each get the same dedicated-column
  // treatment, but only for their own landing page — unlike DMs, the
  // destination after clicking an item is a regular channel with no
  // intrinsic marker tying it back to that section, so the normal sidebar
  // returns once you're actually viewing a channel (same as it always did).
  const section =
    pathname === "/threads"
      ? "threads"
      : pathname === "/later"
        ? "later"
        : pathname === "/drafts"
          ? "drafts"
          : pathname === "/files"
            ? "files"
            : pathname === "/activity"
              ? "activity"
              : null;

  // Live unread flags from Pusher, layered on top of the server-computed
  // `hasUnread` from page load. A Set (not per-channel state) keeps this to
  // one re-render per event regardless of channel count.
  const [liveUnread, setLiveUnread] = useState<Set<string>>(new Set());
  const activeChannelIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    // Visiting a channel clears any live-unread flag we'd set for it —
    // useMessages' mark-channel-read call is the authoritative clear;
    // this just keeps the sidebar from flashing a stale dot.
    if (activeChannelId) {
      setLiveUnread((prev) => {
        if (!prev.has(activeChannelId)) return prev;
        const next = new Set(prev);
        next.delete(activeChannelId);
        return next;
      });
    }
  }, [activeChannelId]);

  // Subscribe to every visible channel's existing private Pusher channel so
  // the sidebar can flag unread activity without opening it. Reuses the same
  // per-channel authorization as the channel view itself (no new Pusher
  // channel type) — fine at this app's scale (a handful to a few dozen
  // channels per user, not thousands).
  // Muted channels never light up (matches the server-suppressed unread and
  // Slack behavior). Held in a ref so the subscribe effect doesn't re-run
  // just because mute state changed.
  const mutedRef = useRef<Set<string>>(new Set());
  mutedRef.current = new Set(channels.filter((c) => c.muted).map((c) => c.id));

  const channelIdsKey = channels.map((c) => c.id).join(",");
  useEffect(() => {
    const ids = channelIdsKey ? channelIdsKey.split(",") : [];
    const names = ids.map(pusherChannelName);
    const boundChannels = names.map((name) => subscribeChannel(name));

    const onActivity = (payload: { message: { parentId?: string | null } }, channelId: string) => {
      if (channelId === activeChannelIdRef.current) return;
      if (mutedRef.current.has(channelId)) return;
      setLiveUnread((prev) => (prev.has(channelId) ? prev : new Set(prev).add(channelId)));
    };

    const handlers = ids.map((id, i) => {
      const handler = (payload: { message: { parentId?: string | null } }) => onActivity(payload, id);
      boundChannels[i].bind("new-message", handler);
      boundChannels[i].bind("new-reply", handler);
      return handler;
    });

    return () => {
      ids.forEach((id, i) => {
        boundChannels[i].unbind("new-message", handlers[i]);
        boundChannels[i].unbind("new-reply", handlers[i]);
        unsubscribeChannel(names[i]);
      });
    };
  }, [channelIdsKey]);

  async function createChannel() {
    const raw = window.prompt("New channel name (lowercase, hyphens):");
    if (!raw) return;
    const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create channel");
        return;
      }
      router.push(`/c/${data.channel.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  // A starred channel is shown only in Starred, not duplicated in
  // Channels/Direct messages, matching Slack.
  const starred = channels.filter((c) => c.isStarred);
  const regular = channels.filter((c) => !c.isDm && !c.isStarred);
  const dms = channels.filter((c) => c.isDm && !c.isStarred);

  function channelLinkProps(c: Channel) {
    return {
      href: `/c/${c.id}`,
      active: pathname === `/c/${c.id}`,
      prefix: c.isDm ? "•" : c.isPrivate ? "🔒" : "#",
      name: c.archivedAt ? `${c.name} (archived)` : c.name,
      // Muted channels never show an unread dot, even from a live event.
      unread: !c.muted && c.id !== activeChannelId && (c.hasUnread || liveUnread.has(c.id)),
      muted: !!c.muted,
      onNavigate: () => setOpen(false),
    };
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col bg-[var(--color-sidebar)] text-[var(--color-on-sidebar)] transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
        {inDmContext ? (
          <DmListColumn
            dmThreads={dmThreads}
            activeChannelId={activeChannelId}
            onNavigate={() => setOpen(false)}
          />
        ) : section === "threads" ? (
          <ThreadListColumn threads={threads} onNavigate={() => setOpen(false)} />
        ) : section === "later" ? (
          <LaterListColumn saved={savedMessages} onNavigate={() => setOpen(false)} />
        ) : section === "drafts" ? (
          <DraftsListColumn drafts={drafts} onNavigate={() => setOpen(false)} />
        ) : section === "files" ? (
          <FilesListColumn files={files} onNavigate={() => setOpen(false)} />
        ) : section === "activity" ? (
          <ActivityListColumn currentUserId={currentUserId} onNavigate={() => setOpen(false)} />
        ) : (
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="mb-3 space-y-0.5">
            <QuickLink href="/unreads" icon="●" label="Unreads" active={pathname === "/unreads"} />
            <QuickLink href="/threads" icon="⚭" label="Threads" active={pathname === "/threads"} />
            <QuickLink href="/drafts" icon="✎" label="Drafts & sent" active={pathname === "/drafts"} />
          </ul>

          {starred.length > 0 && (
            <CollapsibleSection label="Starred" defaultOpen>
              <ul className="space-y-0.5">
                {starred.map((c) => (
                  <ChannelLink key={c.id} {...channelLinkProps(c)} />
                ))}
              </ul>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            label="Channels"
            defaultOpen
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBrowseOpen((v) => !v)}
                  className="text-xs text-[var(--color-on-sidebar-dim)] hover:text-white"
                >
                  Browse
                </button>
                <button
                  onClick={createChannel}
                  disabled={creating}
                  className="rounded px-1 text-[var(--color-on-sidebar-dim)] hover:text-white disabled:opacity-50"
                  aria-label="Create channel"
                  title="Create channel"
                >
                  +
                </button>
              </div>
            }
          >
            <div className="relative">{browseOpen && <BrowseChannelsPanel onClose={() => setBrowseOpen(false)} />}</div>
            <ul className="space-y-0.5">
              {regular.map((c) => (
                <ChannelLink key={c.id} {...channelLinkProps(c)} />
              ))}
              {regular.length === 0 && (
                <li className="px-3 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No channels yet</li>
              )}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            label="Direct messages"
            defaultOpen
            action={
              <Link
                href="/dms/new"
                onClick={() => setOpen(false)}
                className="rounded px-1 text-[var(--color-on-sidebar-dim)] hover:text-white"
                aria-label="Start a direct message"
                title="Start a direct message"
              >
                +
              </Link>
            }
          >
            <ul className="space-y-0.5">
              {dms.map((c) => (
                <ChannelLink key={c.id} {...channelLinkProps(c)} />
              ))}
              {dms.length === 0 && (
                <li className="px-3 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No direct messages yet</li>
              )}
            </ul>
          </CollapsibleSection>

          {error && <p className="mt-2 px-3 text-xs text-red-300">{error}</p>}
        </nav>
        )}
      </aside>
    </>
  );
}

function QuickLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition ${
          active ? "bg-white/15 text-white" : "text-[var(--color-on-sidebar)] hover:bg-white/10"
        }`}
      >
        <span className="text-[var(--color-on-sidebar-dim)]">{icon}</span>
        {label}
      </Link>
    </li>
  );
}

function CollapsibleSection({
  label,
  action,
  defaultOpen,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [openState, setOpenState] = useState(!!defaultOpen);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={() => setOpenState((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-sidebar-dim)] hover:text-white"
        >
          <span className={`inline-block transition-transform ${openState ? "rotate-90" : ""}`}>›</span>
          {label}
        </button>
        {action}
      </div>
      {openState && <div className="mt-1">{children}</div>}
    </div>
  );
}

function ChannelLink({
  href,
  active,
  prefix,
  name,
  unread,
  muted,
  onNavigate,
}: {
  href: string;
  active: boolean;
  prefix: string;
  name: string;
  unread: boolean;
  muted?: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
          active
            ? "bg-[var(--color-sidebar-active)] text-white"
            : `hover:bg-white/10 ${muted ? "text-[var(--color-on-sidebar-dim)]" : "text-[var(--color-on-sidebar)]"}`
        }`}
      >
        <span className="text-[var(--color-on-sidebar-dim)]">{prefix}</span>
        <span className={`truncate ${unread ? "font-semibold text-white" : ""}`}>{name}</span>
        {muted && !active && <span className="ml-auto text-xs opacity-70">🔕</span>}
        {unread && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
        )}
      </Link>
    </li>
  );
}
