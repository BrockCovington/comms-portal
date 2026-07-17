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
  sectionId?: string | null;
};

type Section = { id: string; name: string; position: number };

export function Sidebar({
  channels,
  sections,
  dmThreads,
  threads,
  savedMessages,
  drafts,
  files,
  currentUserId,
}: {
  channels: Channel[];
  sections: Section[];
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

  // --- Custom sections -----------------------------------------------------
  // Which channel is mid-drag (for drop-target highlighting), and which
  // section is currently being dragged over.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // section id, or "__default__"
  // The open "move to section" menu (fixed-positioned to escape the sidebar's
  // overflow clipping), keyed to the channel whose ⋮ was clicked.
  const [menu, setMenu] = useState<{
    channelId: string;
    sectionId: string | null;
    x: number;
    y: number;
  } | null>(null);
  function openMoveMenu(channelId: string, sectionId: string | null, rect: DOMRect) {
    setMenu({ channelId, sectionId, x: rect.right, y: rect.bottom });
  }

  async function refreshAfter(res: Response, fallback: string): Promise<boolean> {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? fallback);
      return false;
    }
    setError(null);
    router.refresh();
    return true;
  }

  async function moveChannel(channelId: string, sectionId: string | null) {
    const res = await fetch(`/api/channels/${channelId}/section`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId }),
    });
    await refreshAfter(res, "Couldn't move channel");
  }

  async function createSection(): Promise<string | null> {
    const raw = window.prompt("New section name:");
    const name = raw?.trim();
    if (!name) return null;
    const res = await fetch("/api/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!(await refreshAfter(res, "Couldn't create section"))) return null;
    return data.section?.id ?? null;
  }

  // Create a section and drop the channel straight into it — the "New
  // section…" path from a channel's move menu.
  async function createSectionAndMove(channelId: string) {
    const id = await createSection();
    if (id) await moveChannel(channelId, id);
  }

  async function renameSection(id: string, current: string) {
    const raw = window.prompt("Rename section:", current);
    const name = raw?.trim();
    if (!name || name === current) return;
    const res = await fetch(`/api/sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await refreshAfter(res, "Couldn't rename section");
  }

  async function deleteSection(id: string, name: string) {
    if (!window.confirm(`Delete section "${name}"? Its channels move back to Channels.`)) return;
    const res = await fetch(`/api/sections/${id}`, { method: "DELETE" });
    await refreshAfter(res, "Couldn't delete section");
  }

  // A starred channel is shown only in Starred, not duplicated in
  // Channels/Direct messages, matching Slack.
  const starred = channels.filter((c) => c.isStarred);
  const regular = channels.filter((c) => !c.isDm && !c.isStarred);
  const dms = channels.filter((c) => c.isDm && !c.isStarred);

  // Group the regular channels by custom section. Anything with no section
  // (or pointing at a section that no longer exists) falls to the default
  // "Channels" group.
  const sectionIds = new Set(sections.map((s) => s.id));
  const channelsInSection = (sectionId: string) =>
    regular.filter((c) => c.sectionId === sectionId);
  const defaultChannels = regular.filter((c) => !c.sectionId || !sectionIds.has(c.sectionId));

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
            <QuickLink href="/canvas" icon="📝" label="Canvases" active={pathname?.startsWith("/canvas") ?? false} />
            <QuickLink href="/lists" icon="☑" label="Lists" active={pathname?.startsWith("/lists") ?? false} />
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

          {/* Custom sections (user-defined), each a drop target. */}
          {sections.map((s) => {
            const items = channelsInSection(s.id);
            return (
              <SectionGroup
                key={s.id}
                title={s.name}
                dropKey={s.id}
                sectionId={s.id}
                dragActive={!!draggingId}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDropChannel={moveChannel}
                action={
                  <div className="flex items-center gap-1.5 text-[var(--color-on-sidebar-dim)]">
                    <button onClick={() => renameSection(s.id, s.name)} className="rounded px-0.5 hover:text-white" title="Rename section">
                      ✎
                    </button>
                    <button onClick={() => deleteSection(s.id, s.name)} className="rounded px-0.5 hover:text-white" title="Delete section">
                      ×
                    </button>
                  </div>
                }
              >
                <ul className="space-y-0.5">
                  {items.map((c) => (
                    <DraggableChannelRow
                      key={c.id}
                      channel={c}
                      link={channelLinkProps(c)}
                      onDragStart={() => setDraggingId(c.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOver(null);
                      }}
                      onOpenMenu={openMoveMenu}
                    />
                  ))}
                  {items.length === 0 && (
                    <li className="px-3 py-1 text-xs text-[var(--color-on-sidebar-dim)]">Drag channels here</li>
                  )}
                </ul>
              </SectionGroup>
            );
          })}

          {/* Default "Channels" group — anything not filed under a section. */}
          <SectionGroup
            title="Channels"
            dropKey="__default__"
            sectionId={null}
            dragActive={!!draggingId}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDropChannel={moveChannel}
            action={
              <div className="flex items-center gap-2 text-[var(--color-on-sidebar-dim)]">
                <button onClick={() => setBrowseOpen((v) => !v)} className="text-xs hover:text-white">
                  Browse
                </button>
                <button onClick={createSection} className="text-xs hover:text-white" title="New section">
                  ＋ Section
                </button>
                <button
                  onClick={createChannel}
                  disabled={creating}
                  className="rounded px-1 hover:text-white disabled:opacity-50"
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
              {defaultChannels.map((c) => (
                <DraggableChannelRow
                  key={c.id}
                  channel={c}
                  link={channelLinkProps(c)}
                  onDragStart={() => setDraggingId(c.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOver(null);
                  }}
                  onOpenMenu={openMoveMenu}
                />
              ))}
              {defaultChannels.length === 0 && (
                <li className="px-3 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No channels yet</li>
              )}
            </ul>
          </SectionGroup>

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

      {menu && (
        <MoveMenu
          menu={menu}
          sections={sections}
          onClose={() => setMenu(null)}
          onMove={moveChannel}
          onCreateAndMove={createSectionAndMove}
        />
      )}
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
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-pink,var(--color-on-sidebar-dim))] hover:text-white"
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
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-surface)]" />
        )}
      </Link>
    </li>
  );
}

type ChannelLinkProps = {
  href: string;
  active: boolean;
  prefix: string;
  name: string;
  unread: boolean;
  muted?: boolean;
  onNavigate: () => void;
};

// A collapsible sidebar group that also acts as a drag-and-drop target: drop
// a channel onto it to file it under this section (or, for the default group,
// to clear its section). Highlights while a channel is dragged over it.
function SectionGroup({
  title,
  dropKey,
  sectionId,
  dragActive,
  dragOver,
  setDragOver,
  onDropChannel,
  action,
  children,
}: {
  title: string;
  dropKey: string;
  sectionId: string | null;
  dragActive: boolean;
  dragOver: string | null;
  setDragOver: (v: string | null | ((cur: string | null) => string | null)) => void;
  onDropChannel: (channelId: string, sectionId: string | null) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const isOver = dragOver === dropKey;
  return (
    <div
      data-section-drop={dropKey}
      className={`mb-3 rounded-md transition ${isOver ? "bg-white/10 ring-1 ring-white/40" : ""}`}
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== dropKey) setDragOver(dropKey);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver((cur) => (cur === dropKey ? null : cur));
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/channel");
        setDragOver(null);
        if (id) onDropChannel(id, sectionId);
      }}
    >
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-pink,var(--color-on-sidebar-dim))] hover:text-white"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          {title}
        </button>
        {action}
      </div>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

// A channel row you can drag between sections, with a ⋮ button that opens the
// "move to section" menu. Mirrors ChannelLink's look but adds the drag handle
// and hover affordance.
function DraggableChannelRow({
  channel,
  link,
  onDragStart,
  onDragEnd,
  onOpenMenu,
}: {
  channel: { id: string; sectionId?: string | null };
  link: ChannelLinkProps;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenMenu: (channelId: string, sectionId: string | null, rect: DOMRect) => void;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/channel", channel.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group/row relative"
    >
      <Link
        href={link.href}
        onClick={link.onNavigate}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
          link.active
            ? "bg-[var(--color-sidebar-active)] text-white"
            : `hover:bg-white/10 ${link.muted ? "text-[var(--color-on-sidebar-dim)]" : "text-[var(--color-on-sidebar)]"}`
        }`}
      >
        <span className="text-[var(--color-on-sidebar-dim)]">{link.prefix}</span>
        <span className={`truncate ${link.unread ? "font-semibold text-white" : ""}`}>{link.name}</span>
        {link.muted && !link.active && <span className="ml-auto text-xs opacity-70">🔕</span>}
        {link.unread && !link.active && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-surface)] group-hover/row:hidden" />
        )}
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenMenu(channel.id, channel.sectionId ?? null, e.currentTarget.getBoundingClientRect());
        }}
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1 text-[var(--color-on-sidebar-dim)] hover:text-white group-hover/row:block"
        aria-label="Channel options"
        title="Move to section"
      >
        ⋮
      </button>
    </li>
  );
}

// The fixed-positioned "move to section" dropdown, opened from a channel's ⋮.
// Fixed (not absolute) so the sidebar's overflow-y-auto can't clip it.
function MoveMenu({
  menu,
  sections,
  onClose,
  onMove,
  onCreateAndMove,
}: {
  menu: { channelId: string; sectionId: string | null; x: number; y: number };
  sections: Section[];
  onClose: () => void;
  onMove: (channelId: string, sectionId: string | null) => void;
  onCreateAndMove: (channelId: string) => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        data-move-menu
        className="fixed z-50 w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-[var(--color-ink)] shadow-lg"
        style={{ left: menu.x, top: menu.y }}
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Move to section
        </p>
        {sections.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--color-ink-soft)]">No sections yet</p>
        )}
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              onMove(menu.channelId, s.id);
              onClose();
            }}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--color-accent-soft)]"
          >
            <span className="truncate">{s.name}</span>
            {menu.sectionId === s.id && <span className="text-[var(--color-accent)]">✓</span>}
          </button>
        ))}
        {menu.sectionId && (
          <button
            onClick={() => {
              onMove(menu.channelId, null);
              onClose();
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--color-accent-soft)]"
          >
            Remove from section
          </button>
        )}
        <button
          onClick={() => {
            onCreateAndMove(menu.channelId);
            onClose();
          }}
          className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          New section…
        </button>
      </div>
    </>
  );
}
