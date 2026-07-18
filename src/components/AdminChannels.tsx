"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";

type AdminChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  archivedAt: string | Date | null;
};

export function AdminChannels({ initialChannels }: { initialChannels: AdminChannel[] }) {
  const [channels, setChannels] = useState(initialChannels);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleArchive(channelId: string, archived: boolean) {
    setBusyId(channelId);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/archive`, {
        method: archived ? "DELETE" : "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update channel");
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, archivedAt: data.channel.archivedAt } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update channel");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Channels" description="Archive channels to make them read-only, or unarchive to reopen them.">
      <div className="overflow-hidden rounded-md border border-[var(--color-line)]">
        <ul className="divide-y divide-[var(--color-line)]">
          {channels.map((c) => {
            const archived = !!c.archivedAt;
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-[var(--color-ink-soft)]">{c.isPrivate ? "🔒" : "#"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--color-ink)]">{c.name}</p>
                  {archived && <p className="text-xs text-[var(--color-ink-soft)]">Archived</p>}
                </div>
                <button
                  onClick={() => handleToggleArchive(c.id, archived)}
                  disabled={busyId === c.id}
                  className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                >
                  {busyId === c.id ? "Working…" : archived ? "Unarchive" : "Archive"}
                </button>
              </li>
            );
          })}
          {channels.length === 0 && (
            <li className="px-3 py-3 text-sm text-[var(--color-ink-soft)]">No channels yet.</li>
          )}
        </ul>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </AdminShell>
  );
}
