"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

function presenceChannelName(channelId: string): string {
  return `presence-channel-${channelId}`;
}

export type PresenceUser = { id: string; name: string | null; image: string | null };

const TYPING_EXPIRY_MS = 3000;
const TYPING_THROTTLE_MS = 2000;

// ---------------------------------------------------------------------------
// Per-channel presence ("who's currently viewing this channel") + typing
// indicators. Presence membership comes straight from Pusher's own presence
// channel bookkeeping (join/leave events) — no polling, no heartbeats.
// Typing is a lightweight server-triggered broadcast on the same channel
// (see /api/channels/[channelId]/typing) rather than a raw Pusher client
// event, so it's fully testable end-to-end rather than depending on a
// Pusher-dashboard setting.
// ---------------------------------------------------------------------------

export function usePresence(channelId: string, currentUserId: string) {
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<PresenceUser[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentAt = useRef(0);

  useEffect(() => {
    const channelName = presenceChannelName(channelId);
    const channel = subscribeChannel(channelName);

    const onSubscribed = (members: {
      each: (cb: (member: { id: string; info: { name: string | null; image: string | null } }) => void) => void;
    }) => {
      const users: PresenceUser[] = [];
      members.each((m) => {
        if (m.id !== currentUserId)
          users.push({ id: m.id, name: m.info?.name ?? null, image: m.info?.image ?? null });
      });
      setOnline(users);
    };

    const onMemberAdded = (member: { id: string; info: { name: string | null; image: string | null } }) => {
      if (member.id === currentUserId) return;
      setOnline((prev) =>
        prev.some((u) => u.id === member.id)
          ? prev
          : [...prev, { id: member.id, name: member.info?.name ?? null, image: member.info?.image ?? null }]
      );
    };

    const onMemberRemoved = (member: { id: string }) => {
      setOnline((prev) => prev.filter((u) => u.id !== member.id));
    };

    const onTyping = (payload: { userId: string; name: string | null }) => {
      if (payload.userId === currentUserId) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.id === payload.userId)) return prev;
        return [...prev, { id: payload.userId, name: payload.name, image: null }];
      });
      const existing = typingTimers.current.get(payload.userId);
      if (existing) clearTimeout(existing);
      typingTimers.current.set(
        payload.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== payload.userId));
          typingTimers.current.delete(payload.userId);
        }, TYPING_EXPIRY_MS)
      );
    };

    channel.bind("pusher:subscription_succeeded", onSubscribed);
    channel.bind("pusher:member_added", onMemberAdded);
    channel.bind("pusher:member_removed", onMemberRemoved);
    channel.bind("typing", onTyping);

    return () => {
      channel.unbind("pusher:subscription_succeeded", onSubscribed);
      channel.unbind("pusher:member_added", onMemberAdded);
      channel.unbind("pusher:member_removed", onMemberRemoved);
      channel.unbind("typing", onTyping);
      unsubscribeChannel(channelName);
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
      setOnline([]);
      setTypingUsers([]);
    };
  }, [channelId, currentUserId]);

  // Throttled, not debounced — the first keystroke of a burst should ping
  // immediately rather than waiting.
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
    lastTypingSentAt.current = now;
    fetch(`/api/channels/${channelId}/typing`, { method: "POST" }).catch(() => {
      // Best-effort — a missed typing ping isn't worth surfacing.
    });
  }, [channelId]);

  return { online, typingUsers, sendTyping };
}
