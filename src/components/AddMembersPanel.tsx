"use client";

import { useEffect, useState } from "react";
import type { ChannelMember } from "@/hooks/useChannelMembers";
import { Avatar } from "@/components/Avatar";

type OrgUser = { id: string; name: string | null; email: string; image: string | null };

export function AddMembersPanel({
  members,
  onAdd,
  onClose,
  isMember,
  canJoin,
  onJoin,
  onLeave,
  isAdmin,
  currentUserId,
  onRemove,
}: {
  members: ChannelMember[];
  onAdd: (userId: string) => Promise<void>;
  onClose: () => void;
  isMember?: boolean;
  canJoin?: boolean;
  onJoin?: () => Promise<void>;
  onLeave?: () => Promise<void>;
  isAdmin?: boolean;
  currentUserId?: string;
  onRemove?: (userId: string) => Promise<void>;
}) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [joinLeaveBusy, setJoinLeaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => setError("Couldn't load org members"))
      .finally(() => setLoading(false));
  }, []);

  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = users.filter((u) => {
    if (memberIds.has(u.id)) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function handleAdd(userId: string) {
    setAdding(userId);
    setError(null);
    try {
      await onAdd(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add member");
    } finally {
      setAdding(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!onRemove) return;
    setRemoving(userId);
    setError(null);
    try {
      await onRemove(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove member");
    } finally {
      setRemoving(null);
    }
  }

  async function handleJoinOrLeave(action: () => Promise<void>) {
    setJoinLeaveBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update membership");
    } finally {
      setJoinLeaveBusy(false);
    }
  }

  return (
    <>
      {/* Same click-outside-to-close backdrop pattern as NewDmPicker. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink)] shadow-lg">
        <div className="border-b border-[var(--color-line)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Members — {members.length}
          </p>
          <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-sm">
                <Avatar name={m.user.name ?? m.user.email} image={m.user.image} size={20} />

                <span className="min-w-0 flex-1 truncate">{m.user.name ?? m.user.email}</span>
                {isAdmin && onRemove && m.userId !== currentUserId && (
                  <button
                    onClick={() => handleRemove(m.userId)}
                    disabled={removing !== null}
                    className="shrink-0 text-xs text-[var(--color-ink-soft)] hover:text-red-600 disabled:opacity-50"
                  >
                    {removing === m.userId ? "…" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-b border-[var(--color-line)] p-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Add people…"
            className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <ul className="max-h-48 overflow-y-auto py-1">
          {!loading && candidates.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--color-ink-soft)]">
              {users.length === 0 ? "Loading…" : "Everyone's already in this channel"}
            </li>
          )}
          {candidates.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => handleAdd(u.id)}
                disabled={adding !== null}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                <Avatar name={u.name ?? u.email} image={u.image} size={24} />

                <span className="min-w-0 flex-1 truncate">{u.name ?? u.email}</span>
                {adding === u.id && (
                  <span className="text-xs text-[var(--color-ink-soft)]">…</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {(isMember || canJoin) && (onJoin || onLeave) && (
          <div className="border-t border-[var(--color-line)] p-2">
            {isMember ? (
              onLeave && (
                <button
                  onClick={() => handleJoinOrLeave(onLeave)}
                  disabled={joinLeaveBusy}
                  className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {joinLeaveBusy ? "Leaving…" : "Leave channel"}
                </button>
              )
            ) : (
              canJoin &&
              onJoin && (
                <button
                  onClick={() => handleJoinOrLeave(onJoin)}
                  disabled={joinLeaveBusy}
                  className="w-full rounded-md bg-[var(--color-accent)] px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {joinLeaveBusy ? "Joining…" : "Join channel"}
                </button>
              )
            )}
          </div>
        )}

        {error && (
          <p className="border-t border-[var(--color-line)] px-3 py-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
