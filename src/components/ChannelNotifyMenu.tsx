"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Level = "ALL" | "MENTIONS" | "NONE";

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "ALL", label: "All messages", hint: "Every new message" },
  { value: "MENTIONS", label: "Mentions & keywords", hint: "@you, DMs, replies, keywords" },
  { value: "NONE", label: "Nothing", hint: "No notifications" },
];

// Per-channel notification control in the channel header: mute toggle +
// notification level. Muting also drives the sidebar (dimmed, no unread dot),
// so a change router.refresh()es to keep that in sync.
export function ChannelNotifyMenu({
  channelId,
  initialMuted,
  initialLevel,
}: {
  channelId: string;
  initialMuted: boolean;
  initialLevel: Level;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [saving, setSaving] = useState(false);

  async function save(patch: { muted?: boolean; level?: Level }) {
    setSaving(true);
    if (patch.muted !== undefined) setMuted(patch.muted);
    if (patch.level !== undefined) setLevel(patch.level);
    try {
      await fetch(`/api/channels/${channelId}/notification-preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // Mute affects the sidebar's unread/dim state, computed server-side.
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notification preferences"
        title={muted ? "Notifications muted" : "Notification preferences"}
        className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
      >
        {muted ? "🔕" : "🔔"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[var(--color-ink)] shadow-lg">
            <label className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm">
              <span>Mute this channel</span>
              <input
                type="checkbox"
                checked={muted}
                disabled={saving}
                onChange={(e) => save({ muted: e.target.checked })}
              />
            </label>
            <div className="my-1 border-t border-[var(--color-line)]" />
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Notify me about
            </p>
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => save({ level: l.value })}
                disabled={saving || muted}
                className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-40 ${
                  level === l.value ? "text-[var(--color-accent)]" : ""
                }`}
              >
                <span className="mt-0.5 w-3 shrink-0">{level === l.value ? "✓" : ""}</span>
                <span>
                  {l.label}
                  <span className="block text-[10px] text-[var(--color-ink-soft)]">{l.hint}</span>
                </span>
              </button>
            ))}
            {muted && (
              <p className="px-2 pt-1 text-[10px] text-[var(--color-ink-soft)]">
                Unmute to change the level.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
