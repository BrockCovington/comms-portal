"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  id: string;
  channelId: string;
  channelName: string;
  isDm: boolean;
  parentId: string | null;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};

const SNIPPET_RADIUS = 40;

function snippet(body: string, query: string): string {
  const index = body.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return body.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(body.length, index + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function goToResult(r: SearchResult) {
    setOpen(false);
    const params = new URLSearchParams({ message: r.id });
    if (r.parentId) params.set("thread", r.parentId);
    router.push(`/c/${r.channelId}?${params.toString()}`);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search messages…"
        className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-[var(--color-on-sidebar-dim)] focus:border-white/30"
      />

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
            {loading && (
              <p className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">Searching…</p>
            )}
            {!loading && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">No messages found</p>
            )}
            <ul className="divide-y divide-[var(--color-line)]">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => goToResult(r)}
                    className="block w-full px-3 py-2 text-left hover:bg-[var(--color-accent-soft)]"
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--color-ink-soft)]">
                      <span className="whitespace-nowrap font-semibold text-[var(--color-ink)]">
                        {r.user.name ?? "Unknown"}
                      </span>
                      <span className="whitespace-nowrap">
                        {r.isDm ? "" : "#"}
                        {r.channelName}
                        {r.parentId && " · in thread"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-[var(--color-ink)]">
                      {snippet(r.body, query)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
