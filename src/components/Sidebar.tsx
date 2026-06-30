"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Channel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isDm: boolean;
};

export function Sidebar({
  channels,
  user,
  workspaceName,
  signOutAction,
}: {
  channels: Channel[];
  user: { name: string; image: string | null };
  workspaceName: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createChannel() {
    const raw = window.prompt("New channel name (lowercase, hyphens):");
    if (!raw) return;
    const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create channel");
        return;
      }
      router.push(`/c/${data.channel.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  const regular = channels.filter((c) => !c.isDm);
  const dms = channels.filter((c) => c.isDm);

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--color-sidebar)] text-[var(--color-on-sidebar)]">
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <span className="truncate text-sm font-semibold text-white">
          {workspaceName}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <SectionLabel
          label="Channels"
          action={
            <button
              onClick={createChannel}
              disabled={creating}
              className="rounded px-1 text-[var(--color-on-sidebar-dim)] hover:text-white disabled:opacity-50"
              aria-label="Create channel"
              title="Create channel"
            >
              +
            </button>
          }
        />
        <ul className="mb-4 mt-1 space-y-0.5">
          {regular.map((c) => (
            <ChannelLink
              key={c.id}
              href={`/c/${c.id}`}
              active={pathname === `/c/${c.id}`}
              prefix={c.isPrivate ? "🔒" : "#"}
              name={c.name}
            />
          ))}
          {regular.length === 0 && (
            <li className="px-3 py-1 text-xs text-[var(--color-on-sidebar-dim)]">
              No channels yet
            </li>
          )}
        </ul>

        {dms.length > 0 && (
          <>
            <SectionLabel label="Direct messages" />
            <ul className="mt-1 space-y-0.5">
              {dms.map((c) => (
                <ChannelLink
                  key={c.id}
                  href={`/c/${c.id}`}
                  active={pathname === `/c/${c.id}`}
                  prefix="•"
                  name={c.name}
                />
              ))}
            </ul>
          </>
        )}

        {error && (
          <p className="mt-2 px-3 text-xs text-red-300">{error}</p>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs">{user.name}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)] hover:bg-[var(--color-sidebar-hover)] hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-on-sidebar-dim)]">
        {label}
      </span>
      {action}
    </div>
  );
}

function ChannelLink({
  href,
  active,
  prefix,
  name,
}: {
  href: string;
  active: boolean;
  prefix: string;
  name: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
          active
            ? "bg-[var(--color-sidebar-active)] text-white"
            : "text-[var(--color-on-sidebar)] hover:bg-[var(--color-sidebar-hover)]"
        }`}
      >
        <span className="text-[var(--color-on-sidebar-dim)]">{prefix}</span>
        <span className="truncate">{name}</span>
      </Link>
    </li>
  );
}
