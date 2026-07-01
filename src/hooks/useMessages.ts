"use client";

import { useCallback, useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusherClient";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  user: { id: string; name: string | null; image: string | null };
};

// ---------------------------------------------------------------------------
// Live updates via Pusher (real-time).
//
// On mount we load the recent history once, then subscribe to this channel's
// private Pusher channel and append messages as they arrive. No more polling.
//
// Subscriptions are authorized server-side in /api/pusher/auth using the same
// access check as the REST API, so you can only receive messages from channels
// you're allowed to read.
// ---------------------------------------------------------------------------

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const pusher = getPusherClient();
    const channelName = `private-channel-${channelId}`;
    const channel = pusher.subscribe(channelName);

    const onNewMessage = (payload: { message: ChatMessage }) => {
      setMessages((prev) => {
        // Dedupe: the sender already appended optimistically, and Pusher
        // delivers to everyone including the sender.
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    };

    channel.bind("new-message", onNewMessage);

    return () => {
      channel.unbind("new-message", onNewMessage);
      pusher.unsubscribe(channelName);
    };
  }, [channelId, refresh]);

  const sendMessage = useCallback(
    async (body: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
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

  return { messages, loading, error, sendMessage, refresh };
}
