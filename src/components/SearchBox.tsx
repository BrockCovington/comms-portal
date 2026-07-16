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

type QueryEcho = {
  text: string;
  from: string[];
  channels: string[];
  hasLink: boolean;
  hasFile: boolean;
  after: string | null;
  before: string | null;
};

const SNIPPET_RADIUS = 40;

// Highlight around the (parsed) free text, not the raw query — the raw query
// may contain operators like "from:@x" that never appear in the body.
function snippet(body: string, text: string): string {
  if (!text) return body.slice(0, SNIPPET_RADIUS * 2) + (body.length > SNIPPET_RADIUS * 2 ? "…" : "");
  const index = body.toLowerCase().indexOf(text.toLowerCase());
  if (index === -1) return body.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(body.length, index + text.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// Human-readable chips for the filters the server actually parsed — confirms
// the operator syntax landed (e.g. "from:@marcus" really became a sender
// filter) rather than being matched as literal text.
function activeFilters(q: QueryEcho): string[] {
  const chips: string[] = [];
  q.from.forEach((f) => chips.push(`from:${f}`));
  q.channels.forEach((c) => chips.push(`in:#${c}`));
  if (q.hasLink) chips.push("has:link");
  if (q.hasFile) chips.push("has:file");
  if (q.after) chips.push(`after ${fmtDate(q.after)}`);
  if (q.before) chips.push(`before ${fmtDate(q.before)}`);
  return chips;
}

export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [queryEcho, setQueryEcho] = useState<QueryEcho | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setQueryEcho(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data.results ?? []);
          setQueryEcho(data.query ?? null);
        })
        .catch(() => {
          setResults([]);
          setQueryEcho(null);
        })
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
  const chips = queryEcho ? activeFilters(queryEcho) : [];
  const snippetText = queryEcho?.text ?? query;

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search — try from:@name in:#channel has:link"
        className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-[var(--color-on-sidebar-dim)] focus:border-white/30"
      />

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-[var(--color-line)] px-3 py-2">
                {chips.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-accent)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
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
                      <span className="whitespace-nowrap">· {fmtDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-[var(--color-ink)]">
                      {snippet(r.body, snippetText)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-[var(--color-line)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
              Operators: <code>from:@name</code> <code>in:#channel</code> <code>has:link</code>{" "}
              <code>has:file</code> <code>after:2026-07-01</code> <code>before:…</code> <code>on:…</code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
