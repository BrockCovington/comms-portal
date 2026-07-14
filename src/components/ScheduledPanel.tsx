"use client";

import { useEffect, useState } from "react";

type Scheduled = { id: string; preview: string; sendAt: string; isReply: boolean };

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Lists this channel's pending scheduled messages with a cancel action.
// Opened from the indicator above the composer.
export function ScheduledPanel({
  channelId,
  onClose,
  onChange,
}: {
  channelId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [items, setItems] = useState<Scheduled[] | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/channels/${channelId}/scheduled`, { cache: "no-store" });
      const data = res.ok ? await res.json() : { scheduled: [] };
      setItems(data.scheduled ?? []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function cancel(id: string) {
    await fetch(`/api/scheduled/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
    onChange();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-96 overflow-y-auto rounded-md border border-[var(--color-line)] bg-white p-2 text-[var(--color-ink)] shadow-lg">
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Scheduled messages
          </p>
          <button onClick={onClose} aria-label="Close" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        {items === null && <p className="px-1 py-2 text-xs text-[var(--color-ink-soft)]">Loading…</p>}
        {items?.length === 0 && (
          <p className="px-1 py-2 text-xs text-[var(--color-ink-soft)]">Nothing scheduled.</p>
        )}
        <ul className="space-y-1">
          {items?.map((s) => (
            <li key={s.id} className="rounded border border-[var(--color-line)] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-accent)]">
                  {formatWhen(s.sendAt)}
                  {s.isReply && <span className="ml-1 font-normal text-[var(--color-ink-soft)]">· in thread</span>}
                </span>
                <button
                  onClick={() => cancel(s.id)}
                  className="shrink-0 text-xs font-medium text-[var(--color-ink-soft)] hover:text-red-600"
                >
                  Cancel
                </button>
              </div>
              <p className="mt-0.5 truncate text-sm text-[var(--color-ink)]">{s.preview || "(attachment)"}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
