"use client";

import { useState } from "react";
import { FullEmojiPicker } from "@/components/FullEmojiPicker";
import { EmojiToken } from "@/components/EmojiToken";

export type UserStatus = { emoji: string | null; text: string | null; expiresAt: string | null };

type DurationKey = "none" | "30m" | "1h" | "4h" | "today";

const DURATIONS: { key: DurationKey; label: string }[] = [
  { key: "none", label: "Don't clear" },
  { key: "30m", label: "30 minutes" },
  { key: "1h", label: "1 hour" },
  { key: "4h", label: "4 hours" },
  { key: "today", label: "Today" },
];

const PRESETS: { emoji: string; text: string; duration: DurationKey }[] = [
  { emoji: "🗓️", text: "In a meeting", duration: "1h" },
  { emoji: "🚌", text: "Commuting", duration: "30m" },
  { emoji: "🤒", text: "Out sick", duration: "today" },
  { emoji: "🌴", text: "Vacationing", duration: "none" },
  { emoji: "🍱", text: "Lunch", duration: "1h" },
];

function durationLabel(key: DurationKey): string {
  return DURATIONS.find((d) => d.key === key)?.label ?? "Don't clear";
}

function computeExpiry(key: DurationKey): string | null {
  const now = Date.now();
  switch (key) {
    case "30m":
      return new Date(now + 30 * 60_000).toISOString();
    case "1h":
      return new Date(now + 60 * 60_000).toISOString();
    case "4h":
      return new Date(now + 4 * 60 * 60_000).toISOString();
    case "today": {
      const end = new Date();
      end.setHours(23, 59, 59, 999); // end of today, local
      return end.toISOString();
    }
    default:
      return null;
  }
}

// The Slack-style "Set a status" modal, opened from the profile panel. Emoji +
// short text, quick presets, and an auto-clear duration.
export function StatusModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: UserStatus;
  onClose: () => void;
  onSaved: (status: UserStatus) => void;
}) {
  const [emoji, setEmoji] = useState<string | null>(initial.emoji);
  const [text, setText] = useState(initial.text ?? "");
  const [duration, setDuration] = useState<DurationKey>("none");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        emoji: emoji || null,
        text: text.trim() || null,
        expiresAt: computeExpiry(duration),
      };
      const res = await fetch("/api/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save status");
        return;
      }
      onSaved(data as UserStatus);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/status", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      onSaved((res.ok ? data : { emoji: null, text: null, expiresAt: null }) as UserStatus);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
          <h2 className="text-base font-semibold">Set a status</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Emoji + text input */}
          <div className="relative flex items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-2 focus-within:border-[var(--color-accent)]">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-lg leading-none text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
              aria-label="Pick an emoji"
              title="Pick an emoji"
            >
              {emoji ? <EmojiToken token={emoji} imgClassName="inline-block h-5 w-5 object-contain" /> : "☺"}
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's your status?"
              maxLength={100}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-soft)]"
            />
            {(emoji || text) && (
              <button
                onClick={() => { setEmoji(null); setText(""); }}
                aria-label="Clear input"
                className="shrink-0 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                ✕
              </button>
            )}
            {pickerOpen && (
              <FullEmojiPicker
                onPick={(token) => { setEmoji(token); setPickerOpen(false); }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>

          {/* Presets */}
          <ul className="mt-4 space-y-0.5">
            {PRESETS.map((p) => (
              <li key={p.text}>
                <button
                  onClick={() => { setEmoji(p.emoji); setText(p.text); setDuration(p.duration); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                >
                  <span className="text-lg leading-none">{p.emoji}</span>
                  <span className="font-medium">{p.text}</span>
                  <span className="text-[var(--color-ink-soft)]">— {durationLabel(p.duration)}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* Clear after */}
          <div className="mt-4 flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--color-ink-soft)]">Clear after</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as DurationKey)}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              {DURATIONS.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-line)] px-5 py-3">
          {initial.emoji || initial.text ? (
            <button
              onClick={clear}
              disabled={busy}
              className="text-xs font-medium text-[var(--color-ink-soft)] hover:text-red-600 disabled:opacity-50"
            >
              Clear status
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
