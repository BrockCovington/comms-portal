"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

// Mirrors userChannelName() in @/lib/pusher — duplicated (not imported) for
// the same reason the hooks do: that module builds the server-side Pusher
// client with the app secret, which must never enter the client bundle.
function userChannelName(userId: string): string {
  return `private-user-${userId}`;
}

type HuddleInvite = {
  channelId: string;
  channelName: string;
  isDm: boolean;
  actorName: string;
  actorImage: string | null;
};
type ActiveInvite = HuddleInvite & { key: string };

const AUTO_DISMISS_MS = 30_000;
const RING_REPEATS = 4;
const RING_GAP_MS = 2_000;

// A short two-tone "incoming call" ring (synthesized — no audio asset).
function playRing(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.22;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
    gain.gain.linearRampToValueAtTime(0, start + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  });
}

// Mounted once, globally (src/app/(app)/layout.tsx). Rings + prompts when
// someone starts a huddle in a channel you're in, no matter where you are in
// the app — the invite arrives on your personal Pusher channel (fanned out
// server-side, already filtered for mute/DND). The chime is why this exists:
// the huddle roster/ring in useHuddle only runs while you're viewing that
// channel, so it can't alert you from elsewhere.
export function IncomingHuddle({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [invites, setInvites] = useState<ActiveInvite[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  // Prime an AudioContext on the first user gesture. Browsers block audio
  // that isn't tied to a prior interaction, so an invite that arrives before
  // the user has clicked anything will show visually but stay silent.
  useEffect(() => {
    function prime() {
      if (!audioRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          try {
            audioRef.current = new Ctor();
          } catch {
            // Audio unavailable — invites still show, just silently.
          }
        }
      } else if (audioRef.current.state === "suspended") {
        audioRef.current.resume().catch(() => {});
      }
    }
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  useEffect(() => {
    const channelName = userChannelName(currentUserId);
    const channel = subscribeChannel(channelName);

    const onInvite = (payload: HuddleInvite) => {
      // If you're already looking at that channel, its huddle bar shows the
      // huddle — no need for a redundant ring/prompt.
      if (pathnameRef.current === `/c/${payload.channelId}`) return;
      setInvites((prev) => {
        // One prompt per channel — a re-broadcast shouldn't stack.
        if (prev.some((i) => i.channelId === payload.channelId)) return prev;
        return [...prev, { ...payload, key: `${payload.channelId}-${Date.now()}` }];
      });

      const ctx = audioRef.current;
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        playRing(ctx);
        let rings = 1;
        const iv = setInterval(() => {
          if (rings >= RING_REPEATS) {
            clearInterval(iv);
            return;
          }
          rings++;
          playRing(ctx);
        }, RING_GAP_MS);
      }

      setTimeout(() => {
        setInvites((prev) => prev.filter((i) => i.channelId !== payload.channelId));
      }, AUTO_DISMISS_MS);
    };

    channel.bind("huddle-invite", onInvite);
    return () => {
      channel.unbind("huddle-invite", onInvite);
      unsubscribeChannel(channelName);
    };
  }, [currentUserId]);

  function dismiss(key: string) {
    setInvites((prev) => prev.filter((i) => i.key !== key));
  }
  function join(inv: ActiveInvite) {
    dismiss(inv.key);
    router.push(`/c/${inv.channelId}`);
  }

  if (invites.length === 0) return null;

  return (
    <div className="fixed right-4 top-16 z-50 flex w-80 flex-col gap-2">
      {invites.map((inv) => (
        <div
          key={inv.key}
          className="rounded-lg border border-[var(--color-line)] bg-white p-3 shadow-lg"
        >
          <p className="text-sm text-[var(--color-ink)]">
            <span aria-hidden>🎧</span> <span className="font-semibold">{inv.actorName}</span> started a
            huddle{inv.isDm ? "" : <> in #{inv.channelName}</>}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => join(inv)}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Join
            </button>
            <button
              onClick={() => dismiss(inv.key)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
