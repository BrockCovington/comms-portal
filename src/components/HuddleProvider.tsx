"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { useHuddle } from "@/hooks/useHuddle";
import { HuddleControls, WaitingAvatars } from "@/components/HuddleBar";

type ActiveHuddle = { channelId: string; label: string };

type HuddleContextValue = {
  active: ActiveHuddle | null;
  // Start or join the huddle in a channel. `label` is the display name shown
  // in the dock header (already prefixed, e.g. "#general" or a DM partner).
  startOrJoin: (channelId: string, label: string) => void;
  close: (channelId?: string) => void;
};

const HuddleContext = createContext<HuddleContextValue | null>(null);

// Consumed by the in-channel launcher and the incoming-invite prompt to open
// the huddle in place, without navigating.
export function useHuddleControls(): HuddleContextValue {
  const ctx = useContext(HuddleContext);
  if (!ctx) throw new Error("useHuddleControls must be used within HuddleProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// One provider mounted at the app layout. It owns the single active huddle and
// renders it as a persistent floating dock (bottom-right) that survives
// navigation — so you can join from anywhere (an invite, another channel) and
// keep talking while you move around the app. There is never more than one
// live LiveKit connection: only the dock connects; the in-channel bar is just
// a launcher.
// ---------------------------------------------------------------------------
export function HuddleProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<ActiveHuddle | null>(null);
  // Created inside the Join/Start click (a user gesture) so the waiting chime
  // and huddle audio aren't blocked by the browser's autoplay policy.
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startOrJoin = useCallback((channelId: string, label: string) => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          audioCtxRef.current = new Ctor();
        } catch {
          // Audio unavailable — the huddle still works, just without the chime.
        }
      }
    } else if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    // Switching directly from one huddle to another: the keyed remount below
    // tears the old connection down (its unmount announces the leave).
    setActive({ channelId, label });
  }, []);

  // Guarded by channelId so a stale onDisconnected from a huddle you just
  // switched away from can't close the new one.
  const close = useCallback((channelId?: string) => {
    setActive((cur) => (channelId && cur && cur.channelId !== channelId ? cur : null));
  }, []);

  return (
    <HuddleContext.Provider value={{ active, startOrJoin, close }}>
      {children}
      {active && (
        <HuddleDock
          key={active.channelId}
          channelId={active.channelId}
          label={active.label}
          currentUserId={currentUserId}
          audioContext={audioCtxRef.current}
          onClose={close}
        />
      )}
    </HuddleContext.Provider>
  );
}

// The floating dock: the one place actually connected to LiveKit. Auto-joins
// on mount and announces the leave on unmount, so every teardown path (Leave
// button, network drop, switching huddles) is covered by a single cleanup.
function HuddleDock({
  channelId,
  label,
  currentUserId,
  audioContext,
  onClose,
}: {
  channelId: string;
  label: string;
  currentUserId: string;
  audioContext: AudioContext | null;
  onClose: (channelId?: string) => void;
}) {
  const router = useRouter();
  const { participants, joining, error, token, serverUrl, join, announceLeave, reactions, sendReaction } =
    useHuddle(channelId, currentUserId, audioContext);

  // Join once on mount (startOrJoin already ran the gesture-side AudioContext
  // setup). Fetching the token isn't itself gesture-sensitive.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    join();
  }, [join]);

  // Single teardown path: whatever unmounts the dock announces the leave.
  useEffect(() => announceLeave, [announceLeave]);

  const sendNote = useCallback(
    async (body: string, attachmentIds?: string[]) => {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachmentIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't send");
      }
    },
    [channelId]
  );

  const openChannel = useCallback(() => router.push(`/c/${channelId}`), [router, channelId]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[24rem] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-lg bg-white shadow-2xl">
      {error ? (
        <div className="rounded-lg border border-[var(--color-line)] p-4 text-sm">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => onClose(channelId)}
            className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
          >
            Close
          </button>
        </div>
      ) : !token || !serverUrl ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] p-4">
          {participants.length > 0 && <WaitingAvatars participants={participants} />}
          <span className="text-sm text-[var(--color-ink-soft)]">
            {joining ? "Connecting to huddle…" : "Starting huddle…"}
          </span>
        </div>
      ) : (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect
          audio
          video={false}
          onDisconnected={() => onClose(channelId)}
        >
          <HuddleControls
            channelId={channelId}
            channelName={label}
            reactions={reactions}
            onLeave={() => onClose(channelId)}
            onSendReaction={sendReaction}
            onSendNote={sendNote}
            onOpenChannel={openChannel}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      )}
    </div>
  );
}
