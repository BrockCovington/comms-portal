"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/useMessages";
import { MessageRow } from "@/components/MessageRow";

export function MessageList({
  channelId,
  messages,
  loading,
  loadingMore,
  hasMore,
  onLoadOlder,
  currentUserId,
  activeThreadId,
  onOpenThread,
  onEdit,
  onDelete,
  memberNames,
  onToggleReaction,
  onToggleSave,
  onTogglePin,
  highlightMessageId,
  seenAt,
  firstUnreadAt,
}: {
  channelId: string;
  messages: ChatMessage[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadOlder?: () => Promise<boolean>;
  currentUserId: string;
  activeThreadId?: string | null;
  onOpenThread: (messageId: string) => void;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  memberNames?: string[];
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onToggleSave?: (messageId: string) => Promise<void>;
  onTogglePin?: (messageId: string) => Promise<void>;
  highlightMessageId?: string | null;
  // DM read receipts: the other person's latest read time (ISO). A single
  // "Seen" is shown under the most recent of my messages at or before it.
  seenAt?: string | null;
  // The read boundary from before this visit (ISO). A "New messages" divider is
  // drawn above the first message after it that isn't the current user's own.
  firstUnreadAt?: string | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const highlightedForRef = useRef<string | null>(null);

  // ↑-to-edit: the composer dispatches "app:edit-last-message" when you press ↑
  // in an empty box; open the editor for your most recent (non-deleted) message.
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    function onEditLast() {
      const own = [...messagesRef.current].reverse().find((m) => m.user.id === currentUserId && !m.deletedAt);
      if (!own) return;
      setAutoEditId(own.id);
      // Clear shortly after so pressing ↑ again re-triggers the same message.
      setTimeout(() => setAutoEditId(null), 150);
    }
    window.addEventListener("app:edit-last-message", onEditLast);
    return () => window.removeEventListener("app:edit-last-message", onEditLast);
  }, [currentUserId]);

  // Prepending older history changes messages.length just like a new message
  // arriving does, but the two need opposite scroll behavior — appended
  // content should pull the view down to it; prepended history should leave
  // the view exactly where it was (handled by the layout effect below), not
  // yank it down to the bottom. A channelId change means a full replacement
  // (switching channels), not a prepend, and should always jump to bottom.
  const prevChannelIdRef = useRef(channelId);
  const prevFirstIdRef = useRef<string | null>(null);
  useEffect(() => {
    const channelChanged = prevChannelIdRef.current !== channelId;
    const firstId = messages[0]?.id ?? null;
    const isPrepend =
      !channelChanged &&
      prevFirstIdRef.current !== null &&
      firstId !== null &&
      firstId !== prevFirstIdRef.current;

    prevChannelIdRef.current = channelId;
    prevFirstIdRef.current = firstId;

    if (!isPrepend) {
      bottomRef.current?.scrollIntoView({ behavior: channelChanged ? "auto" : "smooth" });
    }
  }, [messages.length, channelId]);

  // Loading older history prepends above the current scroll position, which
  // would otherwise visually yank the viewport down (scrollTop stays
  // numerically the same while content above it grows). Standard fix: record
  // scrollHeight/scrollTop right before the fetch, then correct scrollTop by
  // the height that was added once the new content is in the DOM.
  const pendingRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const pending = pendingRestoreRef.current;
    if (el && pending) {
      el.scrollTop = el.scrollHeight - pending.scrollHeight + pending.scrollTop;
      pendingRestoreRef.current = null;
    }
  }, [messages]);

  async function handleLoadOlder() {
    if (!onLoadOlder || !hasMore || loadingMore) return;
    const el = scrollContainerRef.current;
    if (el) pendingRestoreRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    const prepended = await onLoadOlder();
    if (!prepended) pendingRestoreRef.current = null;
  }

  // Infinite scroll: load the next page automatically once the sentinel at
  // the top of the list comes near the viewport, rather than requiring a
  // button click (unlike thread pagination, which intentionally uses one).
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadOlder();
      },
      { root: container, rootMargin: "150px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // handleLoadOlder is intentionally not in deps — it closes over
    // hasMore/loadingMore/onLoadOlder directly, and those ARE listed below,
    // so the observer is recreated exactly when its guard conditions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, onLoadOlder]);

  // Scroll to and briefly flash a message a search result (or anything else
  // that lands here with a target id) points at. Re-checks whenever the
  // list updates since the target may not have loaded yet on the first
  // render — if it's older than what's currently loaded, scrolling near the
  // top triggers the infinite-scroll load above until it's found or history
  // runs out.
  useEffect(() => {
    if (!highlightMessageId || highlightedForRef.current === highlightMessageId) return;
    const el = document.getElementById(`msg-root-${highlightMessageId}`);
    if (!el) return;
    highlightedForRef.current = highlightMessageId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(highlightMessageId);
    const timer = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightMessageId, messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
        Loading messages…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
        No messages yet. Say hello.
      </div>
    );
  }

  // Anchor the "Seen" line under the newest of MY messages the other person
  // has read (createdAt at or before their last-read time). Messages are in
  // display order (oldest→newest), so the last match wins.
  let seenAnchorId: string | null = null;
  if (seenAt) {
    const seenTime = new Date(seenAt).getTime();
    for (const m of messages) {
      if (
        m.user.id === currentUserId &&
        !m.deletedAt &&
        new Date(m.createdAt).getTime() <= seenTime
      ) {
        seenAnchorId = m.id;
      }
    }
  }

  // Anchor the "New messages" divider above the first message after the read
  // boundary that isn't my own (my own messages never count as unread). The
  // boundary is frozen at channel-open, so the divider stays put as new
  // messages stream in below it.
  let firstUnreadId: string | null = null;
  if (firstUnreadAt) {
    const boundary = new Date(firstUnreadAt).getTime();
    for (const m of messages) {
      if (m.user.id !== currentUserId && !m.deletedAt && new Date(m.createdAt).getTime() > boundary) {
        firstUnreadId = m.id;
        break;
      }
    }
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
      <div ref={topSentinelRef} />
      {loadingMore && (
        <p className="pb-3 text-center text-xs text-[var(--color-ink-soft)]">
          Loading earlier messages…
        </p>
      )}
      <ul className="space-y-4">
        {messages.map((m) => (
          <Fragment key={m.id}>
            {m.id === firstUnreadId && (
              <li className="my-1 flex items-center gap-2 text-[11px] font-semibold text-red-500" aria-label="New messages">
                New messages
                <span className="h-px flex-1 bg-red-400/50" />
              </li>
            )}
            <MessageRow
              channelId={channelId}
              message={m}
              currentUserId={currentUserId}
              onOpenThread={onOpenThread}
              isActiveThread={m.id === activeThreadId}
              onEdit={onEdit}
              onDelete={onDelete}
              memberNames={memberNames}
              onToggleReaction={onToggleReaction}
              onToggleSave={onToggleSave}
              onTogglePin={onTogglePin}
              htmlId={`msg-root-${m.id}`}
              isHighlighted={m.id === flashId}
              autoEdit={m.id === autoEditId}
            />
            {m.id === seenAnchorId && seenAt && (
              <li className="-mt-2 pr-1 text-right text-[11px] text-[var(--color-ink-soft)]">
                Seen{" "}
                {new Date(seenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </li>
            )}
          </Fragment>
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
