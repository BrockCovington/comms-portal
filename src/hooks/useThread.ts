"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";
import type { ChatMessage } from "@/hooks/useMessages";
import { applyReactionDelta } from "@/lib/reactions";

function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

function markThreadRead(channelId: string, parentId: string): void {
  fetch(`/api/channels/${channelId}/messages/${parentId}/read`, { method: "POST" }).catch(() => {
    // Best-effort — an unread dot lingering an extra beat isn't worth surfacing.
  });
}

// ---------------------------------------------------------------------------
// A thread is a root message plus its flat list of replies. Threads in this
// app don't nest — replying to a reply still threads onto the root message,
// same as Slack.
//
// Shares the channel's Pusher subscription via the ref-counted helpers in
// pusherClient, since useMessages is normally also subscribed to the same
// channel name while a thread panel is open.
// ---------------------------------------------------------------------------

export function useThread(channelId: string, parentId: string | null, currentUserId: string) {
  const [parent, setParent] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!parentId) return;
    try {
      const res = await fetch(
        `/api/channels/${channelId}/messages/${parentId}/thread`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setError("Couldn't load thread");
        return;
      }
      const data = await res.json();
      setParent(data.parent as ChatMessage);
      setReplies(data.replies as ChatMessage[]);
      setHasMore(!!data.hasMore);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [channelId, parentId]);

  useEffect(() => {
    if (!parentId) {
      setParent(null);
      setReplies([]);
      setHasMore(false);
      return;
    }

    setLoading(true);
    refresh();
    markThreadRead(channelId, parentId);

    const channelName = pusherChannelName(channelId);
    const channel = subscribeChannel(channelName);

    const onNewReply = (payload: { message: ChatMessage }) => {
      if (payload.message.parentId !== parentId) return;
      setReplies((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      markThreadRead(channelId, parentId);
    };

    // Edits and (soft) deletes patch fields on either the parent or a reply.
    const onMessageUpdated = (payload: { message: Partial<ChatMessage> & { id: string } }) => {
      setParent((prev) =>
        prev && prev.id === payload.message.id ? { ...prev, ...payload.message } : prev
      );
      setReplies((prev) =>
        prev.map((r) => (r.id === payload.message.id ? { ...r, ...payload.message } : r))
      );
    };

    // Matches by the message's own id, same as onMessageUpdated — works for
    // both the parent and any reply, no parentId filtering needed.
    const onReactionUpdated = (payload: {
      messageId: string;
      emoji: string;
      userId: string;
      action: "add" | "remove";
      name?: string;
    }) => {
      setParent((prev) =>
        prev && prev.id === payload.messageId
          ? { ...prev, reactions: applyReactionDelta(prev.reactions, payload, currentUserId) }
          : prev
      );
      setReplies((prev) =>
        prev.map((r) =>
          r.id === payload.messageId
            ? { ...r, reactions: applyReactionDelta(r.reactions, payload, currentUserId) }
            : r
        )
      );
    };

    // A pin/unpin flips the flag on the parent or any reply, matched by id.
    const onPinUpdated = (payload: { messageId: string; pinned: boolean }) => {
      setParent((prev) =>
        prev && prev.id === payload.messageId ? { ...prev, isPinned: payload.pinned } : prev
      );
      setReplies((prev) =>
        prev.map((r) => (r.id === payload.messageId ? { ...r, isPinned: payload.pinned } : r))
      );
    };

    channel.bind("new-reply", onNewReply);
    channel.bind("message-updated", onMessageUpdated);
    channel.bind("reaction-updated", onReactionUpdated);
    channel.bind("pin-updated", onPinUpdated);

    return () => {
      channel.unbind("new-reply", onNewReply);
      channel.unbind("message-updated", onMessageUpdated);
      channel.unbind("reaction-updated", onReactionUpdated);
      channel.unbind("pin-updated", onPinUpdated);
      unsubscribeChannel(channelName);
    };
  }, [channelId, parentId, currentUserId, refresh]);

  const loadEarlier = useCallback(async () => {
    if (!parentId || replies.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const cursor = replies[0].id;
      const res = await fetch(
        `/api/channels/${channelId}/messages/${parentId}/thread?before=${cursor}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setReplies((prev) => [...(data.replies as ChatMessage[]), ...prev]);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, parentId, replies, loadingMore]);

  const sendReply = useCallback(
    async (body: string, attachmentIds?: string[], mentionedUserIds?: string[]) => {
      if (!parentId) return;
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId, attachmentIds, mentionedUserIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't send reply");
      }
      const data = await res.json();
      setReplies((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message as ChatMessage];
      });
    },
    [channelId, parentId]
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
    },
    [channelId]
  );

  // Same "personal, not broadcast" shape as useMessages' toggleSave — patch
  // local state directly from the response, works for either the parent or
  // any reply since both live in this hook's state.
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
      setParent((prev) => (prev && prev.id === messageId ? { ...prev, savedByMe: data.saved } : prev));
      setReplies((prev) =>
        prev.map((r) => (r.id === messageId ? { ...r, savedByMe: data.saved } : r))
      );
    },
    [channelId]
  );

  // Shared pin — local state arrives via the pin-updated broadcast, so this
  // just fires the request (same shape as useMessages' togglePin).
  const togglePin = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/pin`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't pin");
      }
    },
    [channelId]
  );

  return {
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
  };
}
