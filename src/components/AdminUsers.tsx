"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminShell } from "@/components/AdminShell";
import type { UserStatusFields } from "@/lib/status";

type Role = "EMPLOYEE" | "ADMIN";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
} & UserStatusFields;

export function AdminUsers({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(userId: string, role: Role) {
    setBusyId(userId);
    setError(null);
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
      setError(e instanceof Error ? e.message : "Couldn't update role");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Members & roles" description="Grant or revoke admin access for people in your workspace.">
      <div className="overflow-hidden rounded-md border border-[var(--color-line)]">
        <ul className="divide-y divide-[var(--color-line)]">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={u.name ?? u.email} image={u.image} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm text-[var(--color-ink)]">
                  <span className="truncate">{u.name ?? u.email}</span>
                  <StatusBadge emoji={u.statusEmoji} text={u.statusText} expiresAt={u.statusExpiresAt} />
                </p>
                <p className="truncate text-xs text-[var(--color-ink-soft)]">{u.email}</p>
              </div>
              <select
                value={u.role}
                disabled={busyId === u.id}
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
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </AdminShell>
  );
}
