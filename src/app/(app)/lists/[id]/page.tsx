"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
import { MenuIcon, PlusIcon, TrashIcon } from "@/components/RailIcons";

type Assignee = { id: string; name: string | null; image: string | null };
type Item = { id: string; text: string; done: boolean; dueAt: string | null; assignee: Assignee | null };
type ListData = { id: string; title: string; createdByName: string | null; canManage: boolean; items: Item[] };
type OrgUser = { id: string; name: string | null; email: string };

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setOpen } = useMobileNav();
  const [list, setList] = useState<ListData | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    fetch(`/api/lists/${id}`, { cache: "no-store" })
      .then((r) => (r.status === 404 ? (setNotFound(true), null) : r.ok ? r.json() : null))
      .then((d: ListData | null) => {
        if (d) { setList(d); setTitleDraft(d.title); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, [id]);

  function patchItem(itemId: string, body: Partial<{ text: string; done: boolean; assigneeId: string | null; dueAt: string | null }>, optimistic: (i: Item) => Item) {
    setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === itemId ? optimistic(i) : i)) } : l));
    fetch(`/api/lists/${id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  async function addItem() {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/lists/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.item) {
        setList((l) => (l ? { ...l, items: [...l.items, data.item] } : l));
        setNewText("");
      }
    } finally {
      setAdding(false);
    }
  }

  function deleteItem(itemId: string) {
    setList((l) => (l ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l));
    fetch(`/api/lists/${id}/items/${itemId}`, { method: "DELETE" }).catch(() => {});
  }

  async function saveTitle() {
    const title = titleDraft.trim() || "Untitled list";
    setEditingTitle(false);
    setList((l) => (l ? { ...l, title } : l));
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }

  async function deleteList() {
    if (!window.confirm("Delete this list and all its items? This can't be undone.")) return;
    const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/lists");
  }

  const doneCount = list?.items.filter((i) => i.done).length ?? 0;

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
        <Link href="/lists" className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]">
          Lists
        </Link>
        <span className="text-[var(--color-ink-soft)]">/</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">
          {list?.title ?? "…"}
        </span>
        {list?.canManage && (
          <button
            onClick={deleteList}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon className="h-4 w-4" /> Delete list
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
          ) : notFound || !list ? (
            <p className="text-sm text-[var(--color-ink-soft)]">This list doesn&apos;t exist.</p>
          ) : (
            <>
              {editingTitle && list.canManage ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(list.title); } }}
                  autoFocus
                  className="mb-1 w-full rounded-md border border-[var(--color-accent)] px-2 py-1 text-2xl font-bold text-[var(--color-ink)] outline-none"
                />
              ) : (
                <h1
                  onClick={() => list.canManage && setEditingTitle(true)}
                  className={`mb-1 text-2xl font-bold text-[var(--color-ink)] ${list.canManage ? "cursor-text hover:opacity-80" : ""}`}
                >
                  {list.title}
                </h1>
              )}
              <p className="mb-5 text-xs text-[var(--color-ink-soft)]">
                {doneCount}/{list.items.length} done · by {list.createdByName ?? "Someone"}
              </p>

              <ul className="divide-y divide-[var(--color-line)] rounded-md border border-[var(--color-line)]">
                {list.items.map((item) => (
                  <li key={item.id} className="group flex items-center gap-3 px-3 py-2">
                    <button
                      onClick={() => patchItem(item.id, { done: !item.done }, (i) => ({ ...i, done: !i.done }))}
                      aria-label={item.done ? "Mark not done" : "Mark done"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        item.done
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                          : "border-[var(--color-line)] hover:border-[var(--color-accent)]"
                      }`}
                    >
                      {item.done && "✓"}
                    </button>

                    <ItemText
                      text={item.text}
                      done={item.done}
                      onSave={(text) => patchItem(item.id, { text }, (i) => ({ ...i, text }))}
                    />

                    <input
                      type="date"
                      value={item.dueAt ? item.dueAt.slice(0, 10) : ""}
                      onChange={(e) =>
                        patchItem(item.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null }, (i) => ({ ...i, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null }))
                      }
                      className="shrink-0 rounded border border-[var(--color-line)] bg-transparent px-1.5 py-1 text-xs text-[var(--color-ink-soft)] outline-none focus:border-[var(--color-accent)]"
                    />

                    <select
                      value={item.assignee?.id ?? ""}
                      onChange={(e) => {
                        const uid = e.target.value || null;
                        const u = users.find((x) => x.id === uid);
                        patchItem(item.id, { assigneeId: uid }, (i) => ({ ...i, assignee: uid ? { id: uid, name: u?.name ?? null, image: null } : null }));
                      }}
                      className="w-28 shrink-0 rounded border border-[var(--color-line)] bg-transparent px-1.5 py-1 text-xs text-[var(--color-ink-soft)] outline-none focus:border-[var(--color-accent)]"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => deleteItem(item.id)}
                      aria-label="Delete item"
                      className="shrink-0 rounded p-1 text-[var(--color-ink-soft)] opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}

                <li className="flex items-center gap-2 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-ink-soft)]">
                    <PlusIcon className="h-4 w-4" />
                  </span>
                  <input
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                    placeholder="Add an item…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]"
                  />
                </li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemText({ text, done, onSave }: { text: string; done: boolean; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim() && draft !== text) onSave(draft.trim()); else setDraft(text); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (draft.trim() && draft !== text) onSave(draft.trim()); }
          if (e.key === "Escape") { setEditing(false); setDraft(text); }
        }}
        autoFocus
        className="min-w-0 flex-1 rounded border border-[var(--color-accent)] px-1.5 py-0.5 text-sm text-[var(--color-ink)] outline-none"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(text); setEditing(true); }}
      className={`min-w-0 flex-1 cursor-text truncate text-sm ${done ? "text-[var(--color-ink-soft)] line-through" : "text-[var(--color-ink)]"}`}
    >
      {text}
    </span>
  );
}
