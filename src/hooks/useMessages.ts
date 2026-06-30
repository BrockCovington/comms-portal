"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  user: { id: string; name: string | null; image: string | null };
};

// ---------------------------------------------------------------------------
// Live updates — PLACEHOLDER IMPLEMENTATION.
//
// This polls the server every few seconds. It works everywhere with zero extra
// services, which is great for getting started. It is NOT true real-time: there
// is a few-seconds delay and it generates steady background requests.
//
// To upgrade to instant delivery, swap the polling below for a managed
// real-time provider (Pusher, Ably, or Supabase Realtime). Vercel's serverless
// runtime can't host a long-lived WebSocket server itself, which is why a
// managed provider is the standard path here. The component API (messages,
// sendMessage, refresh) can stay the same.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 4000;

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    timer.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

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
      // Optimistically append; the next poll reconciles with the server.
      setMessages((prev) => [...prev, data.message as ChatMessage]);
    },
    [channelId]
  );

  return { messages, loading, error, sendMessage, refresh };
}
