"use client";

import { useEffect, useRef, useState } from "react";
import { useThread } from "@/hooks/useThread";
import { MessageRow } from "@/components/MessageRow";
import { MessageComposer } from "@/components/MessageComposer";

export function ThreadPanel({
  channelId,
  parentId,
  currentUserId,
  onClose,
  members,
  memberNames,
  highlightMessageId,
}: {
  channelId: string;
  parentId: string;
  currentUserId: string;
  onClose: () => void;
  members?: { id: string; name: string | null; email: string }[];
  memberNames?: string[];
  highlightMessageId?: string | null;
}) {
  const {
    parent,
    replies,
    loading,
    loadingMore,
    hasMore,
    error,
    sendReply,
    editMessage,
    deleteMessage,
    toggleReaction,
    toggleSave,
    togglePin,
    loadEarlier,
  } = useThread(channelId, parentId, currentUserId);

  const [flashId, setFlashId] = useState<string | null>(null);
  const scrolledForRef = useRef<string | null>(null);

  // Same scroll-and-flash idea as MessageList, but a target reply might live
  // on an older page than what's loaded — keep paging back with the
  // existing loadEarlier() until it turns up or the thread runs out of
  // history (hasMore goes false, which bounds this loop).
  useEffect(() => {
    if (!highlightMessageId || scrolledForRef.current === highlightMessageId) return;

    const targetId =
      highlightMessageId === parent?.id || replies.some((r) => r.id === highlightMessageId)
        ? highlightMessageId
        : null;

    if (targetId) {
      const el = document.getElementById(`msg-thread-${targetId}`);
      if (!el) return; // rendered on the next tick
      scrolledForRef.current = targetId;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(targetId);
      const timer = setTimeout(() => setFlashId(null), 2500);
      return () => clearTimeout(timer);
    }

    if (!loadingMore && hasMore) loadEarlier();
  }, [highlightMessageId, parent, replies, hasMore, loadingMore, loadEarlier]);

  return (
    <div className="flex h-full w-full shrink-0 flex-col md:w-96 md:border-l md:border-[var(--color-line)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-4">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Thread</h2>
        <button
          onClick={onClose}
          aria-label="Close thread"
          className="rounded p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
        >
          ✕
        </button>
      </header>

      {loading && !parent ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
          Loading thread…
        </div>
      ) : !parent ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
          Couldn't load this thread.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <ul>
            <MessageRow
              message={parent}
              currentUserId={currentUserId}
              onEdit={editMessage}
              onDelete={deleteMessage}
              memberNames={memberNames}
              onToggleReaction={toggleReaction}
              onToggleSave={toggleSave}
              onTogglePin={togglePin}
              htmlId={`msg-thread-${parent.id}`}
              isHighlighted={parent.id === flashId}
            />
          </ul>

          <div className="my-3 flex items-center gap-2 text-xs font-medium text-[var(--color-ink-soft)]">
            <span>
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </span>
            <div className="h-px flex-1 bg-[var(--color-line)]" />
          </div>

          {hasMore && (
            <button
              onClick={loadEarlier}
              disabled={loadingMore}
              className="mb-3 w-full rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load earlier replies"}
            </button>
          )}

          <ul className="space-y-4">
            {replies.map((r) => (
              <MessageRow
                key={r.id}
                message={r}
                currentUserId={currentUserId}
                onEdit={editMessage}
                onDelete={deleteMessage}
                memberNames={memberNames}
                onToggleReaction={toggleReaction}
                onToggleSave={toggleSave}
                onTogglePin={togglePin}
                htmlId={`msg-thread-${r.id}`}
                isHighlighted={r.id === flashId}
              />
            ))}
          </ul>
        </div>
      )}

      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

      <MessageComposer
        channelId={channelId}
        channelName=""
        placeholder="Reply…"
        onSend={sendReply}
        members={members}
      />
    </div>
  );
}
