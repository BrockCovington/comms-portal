"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

// Mirrors pusherChannelName() in @/lib/pusher — duplicated (not imported) for
// the same reason every hook does: that module also builds the server-side
// Pusher client with the app secret, which must never enter the client bundle.
function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

export type HuddleParticipant = { id: string; name: string | null; image: string | null };
export type HuddleFloatingReaction = { key: string; emoji: string; name: string | null };

const RECONCILE_INTERVAL_MS = 30000;
const REACTION_DISPLAY_MS = 2500;

// ---------------------------------------------------------------------------
// "Who's in this channel's huddle" + reactions, decoupled from actually being
// connected. The roster is LiveKit's own (GET /api/channels/[id]/huddle,
// backed by RoomServiceClient.listParticipants — the real source of truth),
// kept live via "huddle-participant-joined/-left" and "huddle-reaction" on the
// channel's existing private Pusher channel, with a periodic reconcile as a
// safety net for a missed "left" (e.g. a crashed tab).
//
// Split out from useHuddle so two things can use it independently: the
// in-channel launcher (to show the join count/avatars for the channel you're
// viewing) and the global huddle dock (for the channel you're actually
// connected to) — which may be different channels at the same time.
//
// A null channelId makes the hook inert (empty roster, no subscription).
// ---------------------------------------------------------------------------
export function useHuddleRoster(channelId: string | null) {
  const [participants, setParticipants] = useState<HuddleParticipant[]>([]);
  const [reactions, setReactions] = useState<HuddleFloatingReaction[]>([]);

  const fetchRoster = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/channels/${channelId}/huddle`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setParticipants(data.participants as HuddleParticipant[]);
    } catch {
      // Best-effort — a stale roster for a moment isn't worth surfacing.
    }
  }, [channelId]);

  useEffect(() => {
    if (!channelId) {
      setParticipants([]);
      setReactions([]);
      return;
    }
    fetchRoster();

    const channelName = pusherChannelName(channelId);
    const channel = subscribeChannel(channelName);

    const onJoined = (payload: HuddleParticipant) => {
      setParticipants((prev) => (prev.some((p) => p.id === payload.id) ? prev : [...prev, payload]));
    };
    const onLeft = (payload: { id: string }) => {
      setParticipants((prev) => prev.filter((p) => p.id !== payload.id));
    };
    const onReaction = (payload: { id: string; name: string | null; emoji: string }) => {
      const key = `${payload.id}-${Date.now()}-${Math.random()}`;
      setReactions((prev) => [...prev, { key, emoji: payload.emoji, name: payload.name }]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.key !== key));
      }, REACTION_DISPLAY_MS);
    };

    channel.bind("huddle-participant-joined", onJoined);
    channel.bind("huddle-participant-left", onLeft);
    channel.bind("huddle-reaction", onReaction);

    const interval = setInterval(fetchRoster, RECONCILE_INTERVAL_MS);

    return () => {
      channel.unbind("huddle-participant-joined", onJoined);
      channel.unbind("huddle-participant-left", onLeft);
      channel.unbind("huddle-reaction", onReaction);
      unsubscribeChannel(channelName);
      clearInterval(interval);
    };
  }, [channelId, fetchRoster]);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!channelId) return;
      fetch(`/api/channels/${channelId}/huddle/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      }).catch(() => {
        // Best-effort — a dropped reaction isn't worth surfacing.
      });
    },
    [channelId]
  );

  return { participants, reactions, sendReaction };
}
