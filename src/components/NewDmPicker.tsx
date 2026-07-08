"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type OrgUser = { id: string; name: string | null; email: string; image: string | null };

export function NewDmPicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => setError("Couldn't load members"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function startDm(userId: string) {
    setStarting(userId);
    setError(null);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start DM");
        return;
      }
      onClose();
      router.push(`/c/${data.channel.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setStarting(null);
    }
  }

  return (
    <>
      {/* Invisible click-outside-to-close backdrop, same pattern as the
          mobile-nav drawer backdrop in this same file. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
        <div className="border-b border-[var(--color-line)] p-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a person…"
            className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto py-1">
          {loading && (
            <li className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">Loading…</li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">No one found</li>
          )}
          {filtered.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => startDm(u.id)}
                disabled={starting !== null}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent)]">
                  {(u.name ?? u.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{u.name ?? u.email}</span>
                {starting === u.id && (
                  <span className="text-xs text-[var(--color-ink-soft)]">…</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="border-t border-[var(--color-line)] px-3 py-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
