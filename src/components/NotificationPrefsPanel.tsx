"use client";

import { useEffect, useState } from "react";

type Prefs = { dndUntil: string | null; keywords: string[] };

const DND_PRESETS: { label: string; minutes: number }[] = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "Until tomorrow", minutes: 60 * 16 },
];

function dndLabel(dndUntil: string | null): string | null {
  if (!dndUntil) return null;
  const until = new Date(dndUntil);
  if (until <= new Date()) return null;
  return until.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
}

// Global notification preferences: Do Not Disturb (snooze) + keyword alerts.
// Anchored dropdown opened from the icon rail's "More" menu.
export function NotificationPrefsPanel({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/notification-preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { dndUntil: null, keywords: [] }))
      .then(setPrefs)
      .catch(() => setPrefs({ dndUntil: null, keywords: [] }));
  }, []);

  async function save(patch: Partial<Prefs>) {
    setSaving(true);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setPrefs(await res.json());
    } finally {
      setSaving(false);
    }
  }

  function snooze(minutes: number) {
    save({ dndUntil: new Date(Date.now() + minutes * 60_000).toISOString() });
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || !prefs) return;
    if (prefs.keywords.includes(kw)) { setKeywordInput(""); return; }
    save({ keywords: [...prefs.keywords, kw] });
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    if (!prefs) return;
    save({ keywords: prefs.keywords.filter((k) => k !== kw) });
  }

  const activeDnd = prefs ? dndLabel(prefs.dndUntil) : null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Fixed, not absolute: the icon rail is an overflow-y-auto container,
          which would clip an absolutely-positioned popover to the rail's
          narrow width. Anchored just to the right of the rail, near the
          bottom where the "More" button lives. */}
      <div className="fixed bottom-4 left-[5.5rem] z-50 w-72 rounded-md border border-[var(--color-line)] bg-white p-3 text-[var(--color-ink)] shadow-lg">
        <h3 className="text-sm font-semibold">Notifications</h3>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Do Not Disturb
          </p>
          {activeDnd ? (
            <div className="mt-1.5 flex items-center justify-between rounded bg-[var(--color-accent-soft)] px-2 py-1.5 text-sm">
              <span>Paused until {activeDnd}</span>
              <button
                onClick={() => save({ dndUntil: null })}
                disabled={saving}
                className="text-xs font-medium text-[var(--color-accent)] hover:underline"
              >
                Resume
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DND_PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  onClick={() => snooze(p.minutes)}
                  disabled={saving}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Keyword alerts
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Get notified when these words appear, even without an @mention.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {prefs?.keywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-accent)]"
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} aria-label={`Remove ${kw}`} className="font-bold">
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              placeholder="Add a word…"
              className="min-w-0 flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={addKeyword}
              disabled={saving || !keywordInput.trim()}
              className="rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
