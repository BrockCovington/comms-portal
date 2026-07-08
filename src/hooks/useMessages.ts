"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";
import { applyReactionDelta, type ReactionSummary } from "@/lib/reactions";

// Mirrors pusherChannelName() in @/lib/pusher — duplicated here (rather than
// imported) because that module also constructs the server-side Pusher
// client with the app secret, which must never enter the client bundle.
function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt?: string | null;
  user: { id: string; name: string | null; image: string | null };
  parentId?: string | null;
  replyCount?: number;
  lastReplyAt?: string | null;
  threadUnread?: boolean;
  reactions?: ReactionSummary[];
  attachments?: { id: string; fileName: string; mimeType: string; size: number }[];
  savedByMe?: boolean;
};

function markChannelRead(channelId: string): void {
  fetch(`/api/channels/${channelId}/read`, { method: "POST" }).catch(() => {
    // Best-effort — an unread dot lingering an extra beat isn't worth surfacing.
  });
}

// ---------------------------------------------------------------------------
// Live updates via Pusher (real-time).
//
// On mount we load the recent history once, then subscribe to this channel's
// private Pusher channel and append messages as they arrive. No more polling.
//
// Subscriptions are authorized server-side in /api/pusher/auth using the same
// access check as the REST API, so you can only receive messages from channels
// you're allowed to read.
//
// `activeThreadId` (the thread currently open in the ThreadPanel, if any) is
// read via a ref rather than a Pusher-effect dependency — it changes far more
// often than the channel does, and re-running the subscribe effect for it
// would mean needless unsubscribe/resubscribe churn.
// ---------------------------------------------------------------------------

export function useMessages(
  channelId: string,
  currentUserId: string,
  activeThreadId: string | null = null
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Load existing history once.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Couldn't load messages");
        return;
      }
      const data = await res.json();
      setMessages(data.messages as ChatMessage[]);
      setHasMore(!!data.hasMore);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    refresh();
    markChannelRead(channelId);

    const channelName = pusherChannelName(channelId);
    const channel = subscribeChannel(channelName);

    const onNewMessage = (payload: { message: ChatMessage }) => {
      setMessages((prev) => {
        // Dedupe: the sender already appended optimistically, and Pusher
        // delivers to everyone including the sender.
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      // Keep our own read-state current while this channel is actively open.
      markChannelRead(channelId);
    };

    // A reply doesn't show up in this list — just bump the parent's thread
    // preview (count + last-reply time), and flag it unread unless that
    // thread is the one currently open in the panel.
    const onNewReply = (payload: { message: ChatMessage }) => {
      const { parentId, createdAt } = payload.message;
      if (!parentId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === parentId
            ? {
                ...m,
                replyCount: (m.replyCount ?? 0) + 1,
                lastReplyAt: createdAt,
                threadUnread: parentId !== activeThreadIdRef.current,
              }
            : m
        )
      );
    };

    // Edits and (soft) deletes both just patch fields on the matching message.
    const onMessageUpdated = (payload: { message: Partial<ChatMessage> & { id: string } }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.message.id ? { ...m, ...payload.message } : m))
      );
    };

    // A reaction on a reply doesn't need updating here — replies aren't in
    // this list at all — so only messages with a matching id (a root message)
    // are ever actually touched by the map below.
    const onReactionUpdated = (payload: {
      messageId: string;
      emoji: string;
      userId: string;
      action: "add" | "remove";
    }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, reactions: applyReactionDelta(m.reactions, payload, currentUserId) }
            : m
        )
      );
    };

    channel.bind("new-message", onNewMessage);
    channel.bind("new-reply", onNewReply);
    channel.bind("message-updated", onMessageUpdated);
    channel.bind("reaction-updated", onReactionUpdated);

    return () => {
      channel.unbind("new-message", onNewMessage);
      channel.unbind("new-reply", onNewReply);
      channel.unbind("message-updated", onMessageUpdated);
      channel.unbind("reaction-updated", onReactionUpdated);
      unsubscribeChannel(channelName);
    };
  }, [channelId, currentUserId, refresh]);

  // Returns whether it actually prepended anything, so the caller (which
  // captures scroll position beforehand to compensate for content being
  // added above the viewport) knows whether there's a DOM change to correct
  // for, rather than risking a stale correction being applied on some later,
  // unrelated update.
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!hasMore || loadingMore || messages.length === 0) return false;
    setLoadingMore(true);
    try {
      const cursor = messages[0].id;
      const res = await fetch(`/api/channels/${channelId}/messages?before=${cursor}`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json();
      const older = data.messages as ChatMessage[];
      setHasMore(!!data.hasMore);
      if (older.length === 0) return false;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
      });
      return true;
    } catch {
      return false;
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, messages, hasMore, loadingMore]);

  const sendMessage = useCallback(
    async (body: string, attachmentIds?: string[], mentionedUserIds?: string[]) => {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachmentIds, mentionedUserIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't send message");
      }
      const data = await res.json();
      // Optimistic append; the broadcast handler dedupes by id.
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message as ChatMessage];
      });
    },
    [channelId]
  );

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save edit");
      }
      // Local state updates via the message-updated broadcast (sender included).
    },
    [channelId]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't delete message");
      }
    },
    [channelId]
  );

  // Optimistically clear a thread's unread flag the moment it's opened,
  // rather than waiting on a refetch — the authoritative clear is the
  // ThreadRead upsert fired by useThread when the panel mounts.
  const markThreadRead = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, threadUnread: false } : m))
    );
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't react");
      }
      // Local state updates via the reaction-updated broadcast (sender included).
    },
    [channelId]
  );

  // Saved state is personal (not broadcast to other viewers, unlike
  // reactions), so this updates local state directly from the response
  // rather than waiting on a Pusher event.
  const toggleSave = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/save`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save");
      }
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, savedByMe: data.saved } : m))
      );
    },
    [channelId]
  );

  return {
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
    loadOlder,
    refresh,
  };
}
