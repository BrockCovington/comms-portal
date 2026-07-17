"use client";

import { useEffect, useState } from "react";

type Version = { body: string; editedAt: string; current: boolean };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Popover listing a message's edit history — every prior version plus the
// current one, oldest first. Opened from the "(edited)" label on a message.
export function EditHistory({
  channelId,
  messageId,
  onClose,
}: {
  channelId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);

  useEffect(() => {
    fetch(`/api/channels/${channelId}/messages/${messageId}/history`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d) => setVersions(d.versions ?? []))
      .catch(() => setVersions([]));
  }, [channelId, messageId]);

  function label(v: Version, i: number): string {
    if (v.current) return "Current version";
    if (i === 0) return "Original";
    return "Edited";
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Opens upward: edit history is most often viewed on a recent message
          sitting just above the composer, where a downward popover would run
          off the bottom of the viewport. */}
      <div className="absolute bottom-full left-0 z-50 mb-1 max-h-96 w-80 overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[var(--color-ink)] shadow-lg">
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Edit history
          </p>
          <button onClick={onClose} aria-label="Close" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        {versions === null && <p className="px-1 py-2 text-xs text-[var(--color-ink-soft)]">Loading…</p>}
        <ul className="space-y-2">
          {versions?.map((v, i) => (
            <li key={i} className="rounded border border-[var(--color-line)] p-2">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${v.current ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"}`}>
                  {label(v, i)}
                </span>
                <time className="text-[10px] text-[var(--color-ink-soft)]">{formatTime(v.editedAt)}</time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]">
                {v.body || <span className="italic text-[var(--color-ink-soft)]">(empty)</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
