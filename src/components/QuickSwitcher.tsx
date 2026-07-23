"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";

// ---------------------------------------------------------------------------
// Quick Switcher (⌘K / Ctrl-K): a jump-to modal over channels and people.
// Picking a channel navigates to it; picking a person opens (or creates, via
// the idempotent POST /api/dms) their DM. Data is fetched lazily on first open
// so the component needs no props and can be mounted once, globally.
// ---------------------------------------------------------------------------

type Channel = { id: string; name: string; isPrivate: boolean; isDm: boolean };
type Person = { id: string; name: string | null; email: string; image: string | null };

type Item =
  | { kind: "channel"; id: string; label: string; isPrivate: boolean }
  | { kind: "person"; id: string; label: string; sublabel: string; image: string | null };

export function QuickSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl-K toggle. preventDefault so the browser's own shortcut
  // (focus address bar, in some browsers) doesn't also fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Plain ⌘K only — ⌘⇧K is "new DM" (see KeyboardShortcuts).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load channels + people the first time the switcher is opened.
  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      fetch("/api/channels", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { channels: [] })),
      fetch("/api/users", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { users: [] })),
    ])
      .then(([c, u]) => {
        setChannels((c.channels ?? []).filter((ch: Channel) => !ch.isDm));
        setPeople(u.users ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  // Reset query + focus on each open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const { channelItems, personItems, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (label: string) => {
      if (!q) return 2;
      const l = label.toLowerCase();
      if (l === q) return 0;
      if (l.startsWith(q)) return 1;
      return 2;
    };

    const channelItems: Item[] = channels
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ kind: "channel" as const, id: c.id, label: c.name, isPrivate: c.isPrivate }))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));

    const personItems: Item[] = people
      .filter((p) => {
        if (!q) return true;
        return (p.name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
      })
      .map((p) => ({
        kind: "person" as const,
        id: p.id,
        label: p.name ?? p.email,
        sublabel: p.email,
        image: p.image,
      }))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));

    return { channelItems, personItems, flat: [...channelItems, ...personItems] };
  }, [query, channels, people]);

  // Keep the highlighted index within bounds as results change.
  useEffect(() => {
    setActive((a) => (flat.length === 0 ? 0 : Math.min(a, flat.length - 1)));
  }, [flat.length]);

  // Keep the highlighted row visible while arrow-navigating a long list.
  useEffect(() => {
    if (!open) return;
    document.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = useCallback(
    async (item: Item | undefined) => {
      if (!item || busyId) return;
      if (item.kind === "channel") {
        setOpen(false);
        router.push(`/c/${item.id}`);
        return;
      }
      setBusyId(item.id);
      try {
        const res = await fetch("/api/dms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: item.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.channel?.id) {
          setOpen(false);
          router.push(`/c/${data.channel.id}`);
          router.refresh();
        }
      } finally {
        setBusyId(null);
      }
    },
    [busyId, router]
  );

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  let idx = -1; // running flat index as we render the two groups
  const Row = (item: Item) => {
    idx += 1;
    const i = idx;
    const isActive = i === active;
    return (
      <li key={`${item.kind}-${item.id}`}>
        <button
          type="button"
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(item)}
          disabled={!!busyId}
          data-active={isActive}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left ${
            isActive ? "bg-[var(--color-accent-soft)]" : ""
          }`}
        >
          {item.kind === "channel" ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--color-ink-soft)]">
              {item.isPrivate ? "🔒" : "#"}
            </span>
          ) : (
            <Avatar name={item.label} image={item.image} size={24} variant="solid" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--color-ink)]">{item.label}</span>
            {item.kind === "person" && (
              <span className="block truncate text-xs text-[var(--color-ink-soft)]">{item.sublabel}</span>
            )}
          </span>
          {busyId === item.id && <span className="text-xs text-[var(--color-ink-soft)]">Opening…</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Quick switcher">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl">
        <div className="border-b border-[var(--color-line)] px-3 py-2.5">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a channel or person…"
            aria-label="Search channels and people"
            className="w-full bg-transparent text-base text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!loaded ? (
            <p className="px-2.5 py-6 text-center text-sm text-[var(--color-ink-soft)]">Loading…</p>
          ) : flat.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-sm text-[var(--color-ink-soft)]">No matches</p>
          ) : (
            <>
              {channelItems.length > 0 && (
                <>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Channels
                  </p>
                  <ul>{channelItems.map(Row)}</ul>
                </>
              )}
              {personItems.length > 0 && (
                <>
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    People
                  </p>
                  <ul>{personItems.map(Row)}</ul>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--color-line)] px-3 py-1.5 text-[11px] text-[var(--color-ink-soft)]">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to navigate</span>
          <span><kbd className="font-sans">↵</kbd> to open</span>
          <span><kbd className="font-sans">esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
