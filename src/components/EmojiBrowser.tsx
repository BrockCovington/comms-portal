"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCustomEmoji } from "@/components/CustomEmojiContext";

type GroupedEmoji = { name: string; slug: string; emojis: { emoji: string; name: string; slug: string }[] };

// The searchable emoji list — custom emoji first, then the full Unicode set,
// plus an "add custom emoji" form. Extracted from FullEmojiPicker so it can be
// reused inline (e.g. the huddle quick-reaction editor) as well as inside the
// picker's popover chrome. It renders no backdrop or positioning of its own —
// it just fills the height its parent gives it.
//
// onPick receives a token: a raw unicode grapheme ("🎉") for standard emoji,
// or ":name:" for a custom one. It does NOT close anything — the caller
// decides whether a pick dismisses the surface (the popover) or keeps it open
// (the multi-select editor).
export function EmojiBrowser({
  onPick,
  className = "",
}: {
  onPick: (token: string) => void;
  className?: string;
}) {
  const { emoji: customEmoji, refresh } = useCustomEmoji();
  const [groups, setGroups] = useState<GroupedEmoji[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  // The full Unicode set (~1900 emoji, ~800KB) is lazy-loaded so it never
  // enters the channel bundle — same approach as the Krisp huddle filter.
  useEffect(() => {
    let cancelled = false;
    import("unicode-emoji-json/data-by-group.json").then((mod) => {
      if (!cancelled) setGroups((mod.default ?? mod) as GroupedEmoji[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();

  const filteredStandard = useMemo(() => {
    if (!groups) return [];
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        emojis: g.emojis.filter((e) => e.name.includes(q) || e.slug.includes(q)),
      }))
      .filter((g) => g.emojis.length > 0);
  }, [groups, q]);

  const filteredCustom = useMemo(
    () => (q ? customEmoji.filter((e) => e.name.includes(q)) : customEmoji),
    [customEmoji, q]
  );

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="min-w-0 flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setAdding((v) => !v)}
          title="Add custom emoji"
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && <AddEmojiForm onDone={() => { setAdding(false); refresh(); }} />}

      <div className="flex-1 overflow-y-auto p-2">
        {groups === null && <p className="p-2 text-xs text-[var(--color-ink-soft)]">Loading emoji…</p>}

        {filteredCustom.length > 0 && (
          <section className="mb-3">
            <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Custom
            </h4>
            <div className="flex flex-wrap gap-0.5">
              {filteredCustom.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onPick(`:${e.name}:`)}
                  title={`:${e.name}:`}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-[var(--color-accent-soft)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.url} alt={`:${e.name}:`} className="h-6 w-6 object-contain" />
                </button>
              ))}
            </div>
          </section>
        )}

        {(filteredStandard as GroupedEmoji[]).map((g) => (
          <section key={g.slug} className="mb-3">
            <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              {g.name}
            </h4>
            <div className="flex flex-wrap gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e.slug}
                  onClick={() => onPick(e.emoji)}
                  title={e.name}
                  className="flex h-8 w-8 items-center justify-center rounded text-xl leading-none hover:bg-[var(--color-accent-soft)]"
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          </section>
        ))}

        {groups !== null && q && filteredStandard.length === 0 && filteredCustom.length === 0 && (
          <p className="p-2 text-xs text-[var(--color-ink-soft)]">No emoji match “{query}”.</p>
        )}
      </div>
    </div>
  );
}

function AddEmojiForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!name.trim() || !file) {
      setError("Give it a name and pick an image.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("file", file);
      const res = await fetch("/api/emoji", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't add emoji");
        return;
      }
      onDone();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-[var(--color-line)] bg-[var(--color-accent-soft)]/30 p-2">
      <div className="flex items-center gap-1 text-sm">
        <span className="text-[var(--color-ink-soft)]">:</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          placeholder="name"
          className="w-28 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <span className="text-[var(--color-ink-soft)]">:</span>
        <input ref={fileRef} type="file" accept="image/png,image/gif,image/jpeg,image/webp" className="min-w-0 flex-1 text-xs" />
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
