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
import { ChannelNotifyMenu } from "@/components/ChannelNotifyMenu";
import { ScheduledPanel } from "@/components/ScheduledPanel";
import { HuddleBar } from "@/components/HuddleBar";
import { useMobileNav } from "@/components/MobileNavContext";

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
    sendMessage,
    editMessage,
    deleteMessage,
    markThreadRead,
    toggleReaction,
    toggleSave,
    togglePin,
    loadOlder,
  } = useMessages(channelId, currentUserId, activeThreadId);
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
    () => members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email })),
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
        <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-line)] px-5">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="mr-3 -ml-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] md:hidden"
          >
            ☰
          </button>
          <h1 className="text-base font-semibold text-[var(--color-ink)]">
            {!isDm && <span className="text-[var(--color-ink-soft)]">#</span>} {channelName}
          </h1>
          <button
            onClick={handleToggleStar}
            disabled={starBusy}
            aria-label={isStarred ? "Unstar channel" : "Star channel"}
            title={isStarred ? "Unstar channel" : "Star channel"}
            className="ml-2 rounded p-1 text-[var(--color-ink-soft)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {isStarred ? "★" : "☆"}
          </button>

          <div className="ml-auto flex items-center gap-3">
            {online.length > 0 && (
              <div className="flex items-center -space-x-2">
                {online.slice(0, 5).map((u) => (
                  <span
                    key={u.id}
                    title={`${u.name ?? "Someone"} · online`}
                    className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--color-accent-soft)] text-[10px] font-semibold text-[var(--color-accent)]"
                  >
                    {(u.name ?? "?").charAt(0).toUpperCase()}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-green-500" />
                  </span>
                ))}
              </div>
            )}

            {!isDm && isAdmin && (
              <button
                onClick={handleToggleArchive}
                disabled={archiveBusy}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:opacity-50"
              >
                {archiveBusy
                  ? "Working…"
                  : isArchived
                    ? "Unarchive channel"
                    : "Archive channel"}
              </button>
            )}

            <ChannelNotifyMenu
              channelId={channelId}
              initialMuted={!!notifyMuted}
              initialLevel={notifyLevel ?? "MENTIONS"}
            />

            <div className="relative">
              <button
                onClick={() => setPinnedOpen((v) => !v)}
                aria-label="Pinned messages"
                title="Pinned messages"
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                📌 Pinned
              </button>
              {pinnedOpen && (
                <PinnedPanel
                  channelId={channelId}
                  onClose={() => setPinnedOpen(false)}
                  onNavigate={goToMessage}
                />
              )}
            </div>

            {!isDm && (
              <div className="relative">
                <button
                  onClick={() => setAddMembersOpen((v) => !v)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                >
                  Members ({members.length})
                </button>
                {addMembersOpen && (
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
            )}
          </div>
        </header>

        <HuddleBar
          channelId={channelId}
          channelName={channelName}
          currentUserId={currentUserId}
          isArchived={isArchived}
          onSendNote={sendMessage}
        />

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
      </div>

      {activeThreadId && (
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
