"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useHuddleRoster,
  type HuddleParticipant,
  type HuddleFloatingReaction,
} from "@/hooks/useHuddleRoster";

export type { HuddleParticipant, HuddleFloatingReaction };

const RING_INTERVAL_MS = 3000;

// A small synthesized two-tone chime (no audio asset needed) — played on a
// loop while you're in a huddle alone, waiting for someone to pick up. The
// AudioContext is created by the caller inside a user-gesture call stack (the
// Join button click, in HuddleProvider) or browsers' autoplay policy silently
// blocks it — which is why it's passed in rather than created here.
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
// The huddle CONNECTION for one channel: token fetch (join), a fire-and-forget
// leave announce, and the "waiting alone" chime. The roster (who's in it,
// reactions) is delegated to useHuddleRoster. This runs inside the global
// HuddleConnection (see HuddleProvider) — the single place actually connected
// to LiveKit — so there's never more than one live connection regardless of
// which channel you're viewing.
// ---------------------------------------------------------------------------
export function useHuddle(
  channelId: string,
  currentUserId: string,
  audioContext: AudioContext | null
) {
  const { participants, reactions, sendReaction } = useHuddleRoster(channelId);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const join = useCallback(async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/huddle`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't join huddle");
      setToken(data.token);
      setServerUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join huddle");
    } finally {
      setJoining(false);
    }
  }, [channelId]);

  // Fire-and-forget departure announce (no state — safe to call from an
  // unmount cleanup). The periodic roster reconcile self-heals if it's lost.
  const announceLeave = useCallback(() => {
    fetch(`/api/channels/${channelId}/huddle`, { method: "DELETE" }).catch(() => {});
  }, [channelId]);

  const others = participants.filter((p) => p.id !== currentUserId).length;
  const waitingAlone = !!token && others === 0;

  // Rings while you're the only one in the huddle, stops the moment someone
  // else's join event (or the next reconciliation) adds a second person.
  useEffect(() => {
    if (!waitingAlone || !audioContext) return;
    playChime(audioContext);
    const interval = setInterval(() => playChime(audioContext), RING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [waitingAlone, audioContext]);

  return {
    participants,
    joining,
    error,
    token,
    serverUrl,
    join,
    announceLeave,
    reactions,
    sendReaction,
  };
}
