"use client";

import { useEffect, useState } from "react";

type Pin = {
  messageId: string;
  parentId: string | null;
  preview: string;
  authorName: string | null;
  createdAt: string;
  pinnedByName: string | null;
};

// Anchored dropdown listing a channel's pinned messages (same pattern as
// AddMembersPanel). Fetches on open; clicking a pin jumps to that message
// via the parent's goToMessage, reusing the existing scroll/thread-open
// navigation.
export function PinnedPanel({
  channelId,
  onClose,
  onNavigate,
}: {
  channelId: string;
  onClose: () => void;
  onNavigate: (messageId: string, parentId: string | null) => void;
}) {
  const [pins, setPins] = useState<Pin[] | null>(null);

  useEffect(() => {
    fetch(`/api/channels/${channelId}/pins`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { pins: [] }))
      .then((data) => setPins(data.pins ?? []))
      .catch(() => setPins([]));
  }, [channelId]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
        <div className="border-b border-[var(--color-line)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Pinned {pins ? `— ${pins.length}` : ""}
          </p>
        </div>
        <ul className="max-h-80 divide-y divide-[var(--color-line)] overflow-y-auto">
          {pins === null && (
            <li className="px-3 py-3 text-xs text-[var(--color-ink-soft)]">Loading…</li>
          )}
          {pins?.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-[var(--color-ink-soft)]">
              No pinned messages yet. Hover any message and choose Pin.
            </li>
          )}
          {pins?.map((p) => (
            <li key={p.messageId}>
              <button
                onClick={() => {
                  onNavigate(p.messageId, p.parentId);
                  onClose();
                }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--color-accent-soft)]"
              >
                <p className="text-xs font-semibold text-[var(--color-ink)]">
                  {p.authorName ?? "Someone"}
                  {p.parentId && (
                    <span className="ml-1 font-normal text-[var(--color-ink-soft)]">· in thread</span>
                  )}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                  {p.preview || "(no preview)"}
                </p>
                {p.pinnedByName && (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                    Pinned by {p.pinnedByName}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
