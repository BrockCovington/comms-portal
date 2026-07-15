"use client";

import { useEffect, useMemo, useState } from "react";

type Target = { id: string; name: string; isDm: boolean };

// Modal for forwarding a message into another channel/DM, with an optional
// comment. Self-contained: fetches the user's post targets, posts to the
// target channel's forward endpoint, and closes on success.
export function ForwardDialog({
  sourceChannelId,
  messageId,
  onClose,
}: {
  sourceChannelId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [comment, setComment] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/channels/mine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((d) => setTargets(d.channels ?? []))
      .catch(() => setTargets([]));
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = targets ?? [];
    return q ? list.filter((t) => t.name.toLowerCase().includes(q)) : list;
  }, [targets, filter]);

  async function forward() {
    if (!targetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${targetId}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceChannelId, messageId, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't forward");
        return;
      }
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      // The dialog renders inside a message row whose click opens the thread;
      // stop clicks here from bubbling up and triggering it.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-[var(--color-line)] bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Forward message</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>

        {done ? (
          <p className="py-6 text-center text-sm text-[var(--color-accent)]">Forwarded ✓</p>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              To
            </label>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a channel or person…"
              className="mb-1 w-full rounded-md border border-[var(--color-line)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-line)]">
              {targets === null && <p className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">Loading…</p>}
              {targets !== null && filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">No matches</p>
              )}
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTargetId(t.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)] ${
                    targetId === t.id ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-ink)]"
                  }`}
                >
                  <span className="text-[var(--color-ink-soft)]">{t.isDm ? "•" : "#"}</span>
                  <span className="truncate">{t.name}</span>
                  {targetId === t.id && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)"
              rows={2}
              className="mt-3 w-full resize-none rounded-md border border-[var(--color-line)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            />

            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

            <div className="mt-3 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]">
                Cancel
              </button>
              <button
                onClick={forward}
                disabled={!targetId || busy}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Forwarding…" : "Forward"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
