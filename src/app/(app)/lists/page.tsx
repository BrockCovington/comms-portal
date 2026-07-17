"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
import { MenuIcon, PlusIcon, ListIcon } from "@/components/RailIcons";

type ListItem = {
  id: string;
  title: string;
  createdByName: string | null;
  itemCount: number;
  doneCount: number;
  updatedAt: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function ListsIndexPage() {
  const router = useRouter();
  const { setOpen } = useMobileNav();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/lists", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((d) => setLists(d.lists ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createList() {
    setCreating(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled list" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) router.push(`/lists/${data.id}`);
    } finally {
      setCreating(false);
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
          <MenuIcon className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-[var(--color-pink,var(--color-ink))]">Lists</h1>
        <button
          onClick={createList}
          disabled={creating}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" /> New list
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              No lists yet. Create one to track and manage projects.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lists.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/lists/${l.id}`}
                    className="flex items-center gap-3 rounded-md border border-[var(--color-line)] px-3 py-2.5 hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="text-[var(--color-ink-soft)]">
                      <ListIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                        {l.title}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-ink-soft)]">
                        {l.doneCount}/{l.itemCount} done · {l.createdByName ?? "Someone"} · edited {fmt(l.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
