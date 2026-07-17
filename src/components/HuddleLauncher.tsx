"use client";

import { useHuddleRoster } from "@/hooks/useHuddleRoster";
import { useHuddleControls } from "@/components/HuddleProvider";
import { WaitingAvatars } from "@/components/HuddleBar";

// The in-channel huddle bar — now just a launcher. It shows who's currently in
// this channel's huddle and a Start/Join button; the actual call UI lives in
// the global floating dock (HuddleProvider), so joining doesn't depend on
// staying on this page.
export function HuddleLauncher({
  channelId,
  channelName,
  isDm,
  isArchived,
}: {
  channelId: string;
  channelName: string;
  isDm?: boolean;
  isArchived?: boolean;
}) {
  const { participants } = useHuddleRoster(channelId);
  const { active, startOrJoin } = useHuddleControls();

  // Same "frozen" treatment the composer gets in an archived channel.
  if (isArchived) return null;

  const inThisHuddle = active?.channelId === channelId;
  // The dock header shows this label; prefix channels with # (DMs show the
  // partner's name as passed).
  const label = isDm ? channelName : `#${channelName}`;

  return (
    <div className="shrink-0 border-b border-[var(--color-line)] px-5 py-2">
      <div className="flex items-center gap-3">
        {participants.length > 0 && <WaitingAvatars participants={participants} />}
        {inThisHuddle ? (
          <span className="text-xs font-medium text-[var(--color-accent)]">
            🎧 You&apos;re in this huddle
          </span>
        ) : (
          <button
            onClick={() => startOrJoin(channelId, label)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            {participants.length > 0
              ? `🎧 Join huddle (${participants.length})`
              : "🎧 Start huddle"}
          </button>
        )}
      </div>
    </div>
  );
}
