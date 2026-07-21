"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";
import { EmojiToken } from "@/components/EmojiToken";
import { LinkIcon, PlusIcon } from "@/components/RailIcons";

function pusherChannelName(channelId: string): string {
  return `private-channel-${channelId}`;
}

type Bookmark = { id: string; title: string; url: string; emoji: string | null; position: number; createdById: string };

// Slack-style bookmarks bar under the channel header: quick-access link chips
// any member can add; the creator or an admin can remove. Live-synced over the
// channel's Pusher channel so everyone's bar stays in step.
export function BookmarksBar({
  channelId,
  currentUserId,
  isAdmin,
  isArchived,
}: {
  channelId: string;
  currentUserId: string;
  isAdmin: boolean;
  isArchived: boolean;
}) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  async function load() {
    try {
      const res = await fetch(`/api/channels/${channelId}/bookmarks`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data.bookmarks ?? []);
      }
    } catch {
      // Best-effort — a missing bar for a beat isn't worth surfacing.
    } finally {
      loadedRef.current = true;
    }
  }

  useEffect(() => {
    loadedRef.current = false;
    setBookmarks([]);
    setAdding(false);
    load();
    const name = pusherChannelName(channelId);
    const channel = subscribeChannel(name);
    const onUpdated = () => load();
    channel.bind("bookmark-updated", onUpdated);
    return () => {
      channel.unbind("bookmark-updated", onUpdated);
      unsubscribeChannel(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function add() {
    if (busy) return;
    setError(null);
    if (!url.trim()) return setError("Enter a link");
    setBusy(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), url: url.trim(), emoji: emoji.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't add bookmark");
      if (data.bookmark) setBookmarks((prev) => [...prev, data.bookmark]);
      setTitle("");
      setUrl("");
      setEmoji("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== id)); // optimistic
    await fetch(`/api/channels/${channelId}/bookmarks/${id}`, { method: "DELETE" }).catch(() => {});
  }

  // Nothing to show and nothing to add (archived, empty) → render nothing.
  if (bookmarks.length === 0 && isArchived) return null;

  return (
    <div className="relative flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--color-line)] px-4 py-1.5">
      {bookmarks.map((b) => {
        const canRemove = isAdmin || b.createdById === currentUserId;
        return (
          <span key={b.id} className="group/bm flex shrink-0 items-center">
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              title={b.url}
              className="flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]"
            >
              {b.emoji ? (
                <EmojiToken token={b.emoji} imgClassName="inline-block h-3.5 w-3.5 object-contain" />
              ) : (
                <LinkIcon className="h-3.5 w-3.5" />
              )}
              <span className="truncate">{b.title}</span>
            </a>
            {canRemove && !isArchived && (
              <button
                onClick={() => remove(b.id)}
                aria-label={`Remove bookmark ${b.title}`}
                className="ml-0.5 hidden rounded px-1 text-xs text-[var(--color-ink-soft)] hover:text-red-600 group-hover/bm:block"
              >
                ✕
              </button>
            )}
          </span>
        );
      })}

      {!isArchived && (
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {bookmarks.length === 0 && <span>Add a bookmark</span>}
        </button>
      )}

      {adding && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAdding(false)} />
          <div className="absolute left-4 top-full z-50 mt-1 w-72 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-xl">
            <p className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Add a bookmark</p>
            <label className="mb-1 block text-[11px] font-medium text-[var(--color-ink-soft)]">Link</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="https://…"
              autoFocus
              className="mb-2 w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <label className="mb-1 block text-[11px] font-medium text-[var(--color-ink-soft)]">Label (optional)</label>
            <div className="mb-2 flex gap-2">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="😀"
                className="w-14 rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-center text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder="Name (defaults to the site)"
                className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="rounded-md px-3 py-1.5 text-sm text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]">
                Cancel
              </button>
              <button onClick={add} disabled={busy} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
