"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMessages } from "@/hooks/useMessages";
import { useChannelMembers } from "@/hooks/useChannelMembers";
import { usePresence } from "@/hooks/usePresence";
import { MessageList } from "@/components/MessageList";
import { MessageComposer } from "@/components/MessageComposer";
import { ThreadPanel } from "@/components/ThreadPanel";
import { AddMembersPanel } from "@/components/AddMembersPanel";
import { PinnedPanel } from "@/components/PinnedPanel";
import { Avatar } from "@/components/Avatar";
import { ChannelNotifyMenu } from "@/components/ChannelNotifyMenu";
import { ScheduledPanel } from "@/components/ScheduledPanel";
import { ChannelFilesView } from "@/components/ChannelFilesView";
import { useHuddleControls } from "@/components/HuddleProvider";
import { useHuddleRoster } from "@/hooks/useHuddleRoster";
import { useMobileNav } from "@/components/MobileNavContext";
import {
  MenuIcon,
  StarIcon,
  StarFilledIcon,
  HeadphonesIcon,
  SearchIcon,
  KebabIcon,
  PinIcon,
  UsersIcon,
  ArchiveIcon,
} from "@/components/RailIcons";

export function ChannelView({
  channelId,
  channelName,
  isDm,
  isPrivate,
  isArchived,
  isAdmin,
  isStarred,
  notifyMuted,
  notifyLevel,
  currentUserId,
}: {
  channelId: string;
  channelName: string;
  isDm?: boolean;
  isPrivate?: boolean;
  isArchived?: boolean;
  isAdmin?: boolean;
  isStarred?: boolean;
  notifyMuted?: boolean;
  notifyLevel?: "ALL" | "MENTIONS" | "NONE";
  currentUserId: string;
}) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [scheduledPanelOpen, setScheduledPanelOpen] = useState(false);
  const [rootHighlightId, setRootHighlightId] = useState<string | null>(null);
  const [threadHighlightId, setThreadHighlightId] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [starBusy, setStarBusy] = useState(false);
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    readReceipts,
    firstUnreadAt,
    sendMessage,
    editMessage,
    deleteMessage,
    markThreadRead,
    toggleReaction,
    toggleSave,
    togglePin,
    loadOlder,
  } = useMessages(channelId, currentUserId, activeThreadId);

  // For a DM, the other participant's latest read time (ISO). ISO strings sort
  // chronologically, so the max is the newest. Null for non-DMs / never-read —
  // MessageList uses it to place a single "Seen" under the last read message.
  const seenAt = isDm ? Object.values(readReceipts).sort().at(-1) ?? null : null;
  const {
    members,
    addMember,
    joinChannel,
    leaveChannel,
    removeMember,
    archiveChannel,
    unarchiveChannel,
  } = useChannelMembers(channelId);
  const { online, typingUsers, sendTyping } = usePresence(channelId, currentUserId);
  const { startOrJoin } = useHuddleControls();
  const { participants: huddleParticipants } = useHuddleRoster(channelId);
  const [activeTab, setActiveTab] = useState<"messages" | "files">("messages");
  const [moreOpen, setMoreOpen] = useState(false);
  // For a DM, the other participant — drives the header avatar.
  const otherDmMember = isDm ? members.find((m) => m.userId !== currentUserId)?.user : null;
  const huddleLabel = isDm ? channelName : `#${channelName}`;

  function openSearch() {
    // Focus the top-bar search, prefilled to scope to this channel (channels
    // only — a DM's stored name isn't a usable in: filter).
    const prefill = isDm ? "" : `in:${channelName} `;
    window.dispatchEvent(new CustomEvent("app:focus-search", { detail: { prefill } }));
  }
  const { setOpen: setMobileNavOpen } = useMobileNav();
  const router = useRouter();
  const isMember = members.some((m) => m.userId === currentUserId);

  async function handleLeave() {
    await leaveChannel();
    setAddMembersOpen(false);
    router.push("/c");
    router.refresh();
  }

  async function handleJoin() {
    await joinChannel();
    router.refresh();
  }

  async function handleToggleStar() {
    setStarBusy(true);
    try {
      await fetch(`/api/channels/${channelId}/star`, { method: isStarred ? "DELETE" : "POST" });
      router.refresh();
    } finally {
      setStarBusy(false);
    }
  }

  async function handleToggleArchive() {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await (isArchived ? unarchiveChannel() : archiveChannel());
      router.refresh();
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Couldn't update channel");
    } finally {
      setArchiveBusy(false);
    }
  }

  const composerMembers = useMemo(
    () => members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, image: m.user.image })),
    [members]
  );
  const memberNames = useMemo(
    () => members.map((m) => m.user.name ?? m.user.email),
    [members]
  );

  const openThread = useCallback(
    (messageId: string) => {
      setActiveThreadId(messageId);
      markThreadRead(messageId);
      // A manually-opened thread should never carry over a stale
      // search-driven scroll target from a previous one.
      setThreadHighlightId(null);
    },
    [markThreadRead]
  );

  // Count of the current user's pending scheduled messages in this channel,
  // driving the indicator above the composer. Refreshed on channel change,
  // after scheduling one, and after canceling from the panel.
  const refreshScheduled = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/scheduled`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setScheduledCount(data.scheduled?.length ?? 0);
    } catch {
      // Non-fatal — the indicator just won't update.
    }
  }, [channelId]);

  useEffect(() => {
    refreshScheduled();
  }, [refreshScheduled]);

  // Jump to a message from the pinned panel — a reply opens its thread and
  // highlights within it; a root message scroll-highlights in the main list.
  // Same resolution the search/notification deep-links use.
  const goToMessage = useCallback(
    (messageId: string, parentId: string | null) => {
      if (parentId) {
        openThread(parentId);
        setThreadHighlightId(messageId);
      } else {
        setRootHighlightId(messageId);
      }
    },
    [openThread]
  );

  // A search result links here as /c/[channelId]?message=<id> (root message)
  // or /c/[channelId]?thread=<parentId>&message=<id> (a reply) — resolve it
  // once on arrival, then drop the params so the URL doesn't stay stale
  // after the panel is closed.
  const searchParams = useSearchParams();
  useEffect(() => {
    const threadId = searchParams.get("thread");
    const messageId = searchParams.get("message");
    if (!threadId && !messageId) return;

    if (threadId) {
      openThread(threadId);
      if (messageId) setThreadHighlightId(messageId);
    } else if (messageId) {
      setRootHighlightId(messageId);
    }
    router.replace(`/c/${channelId}`);
  }, [searchParams, channelId, openThread, router]);

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`h-full min-h-0 min-w-0 flex-1 flex-col ${
          activeThreadId ? "hidden md:flex" : "flex"
        }`}
      >
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--color-line)] px-4">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="mr-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] md:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <button
            onClick={handleToggleStar}
            disabled={starBusy}
            aria-label={isStarred ? "Unstar" : "Star"}
            title={isStarred ? "Unstar" : "Star"}
            className="rounded p-1 text-[var(--color-ink-soft)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {isStarred ? (
              <StarFilledIcon className="h-5 w-5 text-[var(--color-accent)]" />
            ) : (
              <StarIcon className="h-5 w-5" />
            )}
          </button>

          {isDm ? (
            <span className="ml-1 flex min-w-0 items-center gap-2">
              <Avatar
                name={otherDmMember?.name ?? channelName}
                image={otherDmMember?.image ?? null}
                size={28}
                variant="solid"
              />
              <h1 className="truncate text-base font-semibold text-[var(--color-pink,var(--color-ink))]">
                {channelName}
              </h1>
            </span>
          ) : (
            <h1 className="ml-1 truncate text-base font-semibold text-[var(--color-pink,var(--color-ink))]">
              <span className="text-[var(--color-ink-soft)]">#</span> {channelName}
            </h1>
          )}

          <div className="ml-auto flex items-center gap-1">
            {online.length > 0 && (
              <div className="mr-1 flex items-center -space-x-2">
                {online.slice(0, 3).map((u) => (
                  <span key={u.id} title={`${u.name ?? "Someone"} · online`} className="relative inline-block">
                    <Avatar name={u.name} image={u.image} size={24} className="border-2 border-[var(--color-canvas)]" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--color-canvas)] bg-green-500" />
                  </span>
                ))}
              </div>
            )}

            {!isArchived && (
              <button
                onClick={() => startOrJoin(channelId, huddleLabel)}
                aria-label="Start or join huddle"
                title="Huddle"
                className="relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                <HeadphonesIcon className="h-5 w-5" />
                {huddleParticipants.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-semibold text-white">
                    {huddleParticipants.length}
                  </span>
                )}
              </button>
            )}

            <ChannelNotifyMenu
              channelId={channelId}
              initialMuted={!!notifyMuted}
              initialLevel={notifyLevel ?? "MENTIONS"}
            />

            <button
              onClick={openSearch}
              aria-label="Search this conversation"
              title="Search"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
            >
              <SearchIcon className="h-5 w-5" />
            </button>

            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="More"
                title="More"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                <KebabIcon className="h-5 w-5" />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-left shadow-lg">
                    <button
                      onClick={() => { setMoreOpen(false); setPinnedOpen(true); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                    >
                      <PinIcon className="h-4 w-4" /> Pinned messages
                    </button>
                    {!isDm && (
                      <button
                        onClick={() => { setMoreOpen(false); setAddMembersOpen(true); }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                      >
                        <UsersIcon className="h-4 w-4" /> Members ({members.length})
                      </button>
                    )}
                    {!isDm && isAdmin && (
                      <button
                        onClick={() => { setMoreOpen(false); handleToggleArchive(); }}
                        disabled={archiveBusy}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                      >
                        <ArchiveIcon className="h-4 w-4" /> {isArchived ? "Unarchive channel" : "Archive channel"}
                      </button>
                    )}
                  </div>
                </>
              )}
              {pinnedOpen && (
                <PinnedPanel channelId={channelId} onClose={() => setPinnedOpen(false)} onNavigate={goToMessage} />
              )}
              {addMembersOpen && !isDm && (
                <AddMembersPanel
                  members={members}
                  onAdd={addMember}
                  onClose={() => setAddMembersOpen(false)}
                  isMember={isMember}
                  canJoin={!isPrivate && !isArchived}
                  onJoin={handleJoin}
                  onLeave={handleLeave}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                  onRemove={removeMember}
                />
              )}
            </div>
          </div>
        </header>

        {/* Tabs — Messages / Files & links */}
        <div className="flex shrink-0 items-center gap-4 border-b border-[var(--color-line)] px-5">
          <TabButton active={activeTab === "messages"} onClick={() => setActiveTab("messages")}>
            Messages
          </TabButton>
          <TabButton
            active={activeTab === "files"}
            onClick={() => { setActiveTab("files"); setActiveThreadId(null); }}
          >
            Files &amp; links
          </TabButton>
        </div>

        {activeTab === "files" ? (
          <ChannelFilesView
            channelId={channelId}
            onOpenMessage={(id) => {
              setActiveTab("messages");
              goToMessage(id, null);
            }}
          />
        ) : (
          <>
            <MessageList
              channelId={channelId}
              messages={messages}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadOlder={loadOlder}
              currentUserId={currentUserId}
              activeThreadId={activeThreadId}
              onOpenThread={openThread}
              onEdit={editMessage}
              onDelete={deleteMessage}
              memberNames={memberNames}
              onToggleReaction={toggleReaction}
              onToggleSave={toggleSave}
              onTogglePin={togglePin}
              highlightMessageId={rootHighlightId}
              seenAt={seenAt}
              firstUnreadAt={firstUnreadAt}
            />

            {error && (
              <p className="px-5 pb-1 text-xs text-red-600">{error}</p>
            )}

            {/* Fixed height so the composer doesn't jump up and down as people
                start/stop typing. */}
            <div className="h-5 shrink-0 px-5 text-xs text-[var(--color-ink-soft)]">
              {typingUsers.length === 1 && <span>{typingUsers[0].name ?? "Someone"} is typing…</span>}
              {typingUsers.length === 2 && (
                <span>
                  {typingUsers[0].name ?? "Someone"} and {typingUsers[1].name ?? "someone"} are typing…
                </span>
              )}
              {typingUsers.length > 2 && <span>Several people are typing…</span>}
            </div>

            {archiveError && (
              <p className="px-5 pb-1 text-xs text-red-600">{archiveError}</p>
            )}

            {isArchived ? (
              <div className="shrink-0 border-t border-[var(--color-line)] p-4 text-center text-xs text-[var(--color-ink-soft)]">
                This channel is archived — read only.
              </div>
            ) : (
              <>
                {scheduledCount > 0 && (
                  <div className="relative px-5">
                    <button
                      onClick={() => setScheduledPanelOpen((v) => !v)}
                      className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                    >
                      🕐 {scheduledCount} scheduled message{scheduledCount === 1 ? "" : "s"}
                    </button>
                    {scheduledPanelOpen && (
                      <ScheduledPanel
                        channelId={channelId}
                        onClose={() => setScheduledPanelOpen(false)}
                        onChange={refreshScheduled}
                      />
                    )}
                  </div>
                )}
                <MessageComposer
                  channelId={channelId}
                  channelName={channelName}
                  onSend={sendMessage}
                  placeholder={isDm ? `Message ${channelName}` : undefined}
                  members={composerMembers}
                  onTyping={sendTyping}
                  draftsEnabled
                  schedulingEnabled
                  onScheduled={refreshScheduled}
                />
              </>
            )}
          </>
        )}
      </div>

      {activeThreadId && activeTab === "messages" && (
        <ThreadPanel
          channelId={channelId}
          parentId={activeThreadId}
          currentUserId={currentUserId}
          onClose={() => setActiveThreadId(null)}
          members={composerMembers}
          memberNames={memberNames}
          highlightMessageId={threadHighlightId}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm transition ${
        active
          ? "border-[var(--color-accent)] font-semibold text-[var(--color-ink)]"
          : "border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
