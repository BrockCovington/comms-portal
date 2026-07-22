"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";

type AdminUser = { id: string; name: string | null; email: string };
type Group = { id: string; handle: string; name: string; memberIds: string[] };

export function AdminGroups({ initialGroups, users }: { initialGroups: Group[]; users: AdminUser[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // group id whose members are open

  async function createGroup() {
    setError(null);
    if (!handle.trim() || !name.trim()) return setError("Handle and name are required");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim(), name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't create group");
      setGroups((prev) => [...prev, { id: data.id, handle: handle.trim().toLowerCase(), name: name.trim(), memberIds: [] }].sort((a, b) => a.handle.localeCompare(b.handle)));
      setHandle("");
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!window.confirm("Delete this group? Mentions of it will stop notifying anyone.")) return;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    await fetch(`/api/admin/groups/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  async function toggleMember(group: Group, userId: string) {
    const has = group.memberIds.includes(userId);
    const memberIds = has ? group.memberIds.filter((x) => x !== userId) : [...group.memberIds, userId];
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, memberIds } : g)));
    await fetch(`/api/admin/groups/${group.id}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds }),
    }).catch(() => {});
  }

  return (
    <AdminShell title="User groups" description="Create @-mentionable groups (e.g. @eng) and choose who's in them.">
      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-md border border-[var(--color-line)] p-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-ink-soft)]">Handle</span>
          <span className="flex items-center gap-1">
            <span className="text-[var(--color-ink-soft)]">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="eng"
              className="w-32 rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </span>
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-ink-soft)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Engineering"
            className="w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          onClick={createGroup}
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Create group
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">No groups yet. Create one above.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-md border border-[var(--color-line)]">
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="font-medium text-[var(--color-accent)]">@{g.handle}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink)]">{g.name}</span>
                <span className="text-xs text-[var(--color-ink-soft)]">{g.memberIds.length} {g.memberIds.length === 1 ? "member" : "members"}</span>
                <button
                  onClick={() => setEditing(editing === g.id ? null : g.id)}
                  className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                >
                  {editing === g.id ? "Done" : "Members"}
                </button>
                <button
                  onClick={() => deleteGroup(g.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
              {editing === g.id && (
                <div className="max-h-64 overflow-y-auto border-t border-[var(--color-line)] p-2">
                  {users.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--color-accent-soft)]">
                      <input
                        type="checkbox"
                        checked={g.memberIds.includes(u.id)}
                        onChange={() => toggleMember(g, u.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-[var(--color-ink)]">{u.name ?? u.email}</span>
                      <span className="truncate text-xs text-[var(--color-ink-soft)]">{u.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
