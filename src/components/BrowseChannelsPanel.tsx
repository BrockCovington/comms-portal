"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BrowseChannel = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  joined: boolean;
};

export function BrowseChannelsPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [channels, setChannels] = useState<BrowseChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels/browse")
      .then((res) => res.json())
      .then((data) => setChannels(data.channels ?? []))
      .catch(() => setError("Couldn't load channels"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = channels.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
  });

  async function join(c: BrowseChannel) {
    setBusyId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${c.id}/join`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't join channel");
      }
      onClose();
      router.push(`/c/${c.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join channel");
    } finally {
      setBusyId(null);
    }
  }

  async function leave(c: BrowseChannel) {
    setBusyId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${c.id}/members`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't leave channel");
      }
      setChannels((prev) =>
        prev.map((ch) => (ch.id === c.id ? { ...ch, joined: false, memberCount: ch.memberCount - 1 } : ch))
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave channel");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {/* Same click-outside-to-close backdrop pattern used across this app's
          anchored pickers (NewDmPicker, AddMembersPanel, EmojiPicker). */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-lg">
        <div className="border-b border-[var(--color-line)] p-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a channel…"
            className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {loading && <li className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">Loading…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">No channels found</li>
          )}
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium text-[var(--color-ink)]">#{c.name}</span>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                {c.description && (
                  <p className="truncate text-xs text-[var(--color-ink-soft)]">{c.description}</p>
                )}
              </div>
              <button
                onClick={() => (c.joined ? leave(c) : join(c))}
                disabled={busyId !== null}
                className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                  c.joined
                    ? "text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
                    : "bg-[var(--color-accent)] text-white hover:opacity-90"
                }`}
              >
                {busyId === c.id ? "…" : c.joined ? "Leave" : "Join"}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="border-t border-[var(--color-line)] px-3 py-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    </>
  );
}
