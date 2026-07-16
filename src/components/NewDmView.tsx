"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
import { Avatar } from "@/components/Avatar";

type OrgUser = { id: string; name: string | null; email: string; image: string | null };

// Full-pane "new DM" compose view — replaces the old NewDmPicker dropdown,
// which broke when reused inside DmListColumn's narrow pencil-button
// wrapper (its "absolute left-0 right-0" sizing assumed a full-width
// relatively-positioned parent). Renders in the main content pane instead,
// same spot ChannelView normally occupies.
export function NewDmView() {
  const router = useRouter();
  const { setOpen } = useMobileNav();
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
      router.push(`/c/${data.channel.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] md:hidden"
        >
          ☰
        </button>
        <h1 className="text-sm font-semibold text-[var(--color-ink)]">New message</h1>
      </header>

      <div className="border-b border-[var(--color-line)] px-5 py-3">
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="To: find a person…"
          className="w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <li className="px-3 py-2 text-sm text-[var(--color-ink-soft)]">Loading…</li>
        )}
        {!loading && filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-[var(--color-ink-soft)]">No one found</li>
        )}
        {filtered.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => startDm(u.id)}
              disabled={starting !== null}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              <Avatar name={u.name ?? u.email} image={u.image} size={32} />

              <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">
                {u.name ?? u.email}
              </span>
              {starting === u.id && (
                <span className="text-xs text-[var(--color-ink-soft)]">Starting…</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="border-t border-[var(--color-line)] px-5 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
