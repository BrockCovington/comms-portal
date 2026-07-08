"use client";

import { useState } from "react";

type Role = "EMPLOYEE" | "ADMIN";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
};

type AdminChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  archivedAt: string | Date | null;
};

export function AdminDashboard({
  initialUsers,
  initialChannels,
}: {
  initialUsers: AdminUser[];
  initialChannels: AdminChannel[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [channels, setChannels] = useState(initialChannels);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [channelBusyId, setChannelBusyId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  async function handleRoleChange(userId: string, role: Role) {
    setUserBusyId(userId);
    setUserError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update role");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.user.role } : u)));
    } catch (e) {
      setUserError(e instanceof Error ? e.message : "Couldn't update role");
    } finally {
      setUserBusyId(null);
    }
  }

  async function handleToggleArchive(channelId: string, archived: boolean) {
    setChannelBusyId(channelId);
    setChannelError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/archive`, {
        method: archived ? "DELETE" : "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update channel");
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, archivedAt: data.channel.archivedAt } : c))
      );
    } catch (e) {
      setChannelError(e instanceof Error ? e.message : "Couldn't update channel");
    } finally {
      setChannelBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-[var(--color-ink)]">Admin</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Manage user roles and channel archiving.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Users</h2>
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--color-line)]">
          <ul className="divide-y divide-[var(--color-line)]">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent)]">
                  {(u.name ?? u.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--color-ink)]">{u.name ?? u.email}</p>
                  <p className="truncate text-xs text-[var(--color-ink-soft)]">{u.email}</p>
                </div>
                <select
                  value={u.role}
                  disabled={userBusyId === u.id}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-ink)] disabled:opacity-50"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
        {userError && <p className="mt-2 text-xs text-red-600">{userError}</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Channels</h2>
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--color-line)]">
          <ul className="divide-y divide-[var(--color-line)]">
            {channels.map((c) => {
              const archived = !!c.archivedAt;
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-[var(--color-ink-soft)]">{c.isPrivate ? "🔒" : "#"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--color-ink)]">{c.name}</p>
                    {archived && (
                      <p className="text-xs text-[var(--color-ink-soft)]">Archived</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleArchive(c.id, archived)}
                    disabled={channelBusyId === c.id}
                    className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  >
                    {channelBusyId === c.id ? "Working…" : archived ? "Unarchive" : "Archive"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {channelError && <p className="mt-2 text-xs text-red-600">{channelError}</p>}
      </section>
    </div>
  );
}
