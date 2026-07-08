"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

// Mirrors pusherChannelName() in @/lib/pusher — duplicated here (rather than
// imported) for the same reason every other hook in this app does: that
// module also constructs the server-side Pusher client with the app
// secret, which must never enter the client bundle.
function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

export type HuddleParticipant = { id: string; name: string | null; image: string | null };
export type HuddleFloatingReaction = { key: string; emoji: string; name: string | null };

const RECONCILE_INTERVAL_MS = 30000;
const RING_INTERVAL_MS = 3000;
const REACTION_DISPLAY_MS = 2500;

// A small synthesized two-tone chime (no audio asset needed) — played on a
// loop while you're in a huddle alone, waiting for someone to pick up.
// AudioContext must be created/resumed inside a user-gesture call stack (the
// Join button's click) or browsers' autoplay policy silently blocks it —
// see where this is called from in join() below.
function playChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [600, 800].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

// ---------------------------------------------------------------------------
// The roster ("who's in the huddle") and actually joining are two separate
// concerns:
//  - The roster comes from LiveKit itself (GET /api/channels/[id]/huddle,
//    backed by RoomServiceClient.listParticipants — the real source of
//    truth for who's connected), kept live via explicit
//    "huddle-participant-joined"/"-left" events on the channel's existing
//    private Pusher channel (already subscribed by useMessages — this just
//    adds a ref-counted second bind, not a new connection). A periodic
//    reconciliation re-fetches the real LiveKit roster as a safety net for
//    a missed "left" broadcast (e.g. a crashed tab) — see the plan's
//    explicit scope note on that bounded staleness window.
//  - Actually joining (the token fetch + LiveKit connection) only happens
//    when you click Join — see HuddleBar, which mounts <LiveKitRoom> only
//    once `isJoined` is true.
// ---------------------------------------------------------------------------

export function useHuddle(channelId: string, currentUserId: string) {
  const [participants, setParticipants] = useState<HuddleParticipant[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [reactions, setReactions] = useState<HuddleFloatingReaction[]>([]);

  const fetchRoster = useCallback(async () => {
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

  // Guards leave() against firing twice (e.g. the user clicks Leave right
  // as onDisconnected also fires from the LiveKit room).
  const leavingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const join = useCallback(async () => {
    // Created synchronously, as the very first thing this does, so it's
    // still inside the click event's call stack — required for browsers to
    // allow audio playback later without another user gesture.
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new Ctor();
    } else if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }

    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/huddle`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't join huddle");
      setToken(data.token);
      setServerUrl(data.url);
      setIsJoined(true);
      leavingRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join huddle");
    } finally {
      setJoining(false);
    }
  }, [channelId]);

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setIsJoined(false);
    setToken(null);
    setServerUrl(null);
    setParticipants((prev) => prev.filter((p) => p.id !== currentUserId));
    fetch(`/api/channels/${channelId}/huddle`, { method: "DELETE" }).catch(() => {
      // Best-effort — the periodic reconciliation self-heals if this is lost.
    });
  }, [channelId, currentUserId]);

  const sendReaction = useCallback(
    (emoji: string) => {
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

  const isInHuddle = participants.some((p) => p.id === currentUserId);
  const waitingAlone = isJoined && participants.filter((p) => p.id !== currentUserId).length === 0;

  // Rings while you're the only one in the huddle, stops the moment someone
  // else's join event (or the next reconciliation) adds a second person.
  useEffect(() => {
    if (!waitingAlone || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    playChime(ctx);
    const interval = setInterval(() => playChime(ctx), RING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [waitingAlone]);

  return {
    participants,
    isInHuddle,
    isJoined,
    joining,
    error,
    token,
    serverUrl,
    join,
    leave,
    reactions,
    sendReaction,
  };
}
