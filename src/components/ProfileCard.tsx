"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { EmojiToken } from "@/components/EmojiToken";

export type CardUser = {
  id: string;
  name: string | null;
  image: string | null;
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpiresAt?: string | Date | null;
};

function statusActive(u: CardUser): boolean {
  if (!u.statusEmoji && !u.statusText) return false;
  if (u.statusExpiresAt) {
    const t = typeof u.statusExpiresAt === "string" ? new Date(u.statusExpiresAt).getTime() : u.statusExpiresAt.getTime();
    if (t <= Date.now()) return false;
  }
  return true;
}

// A click-triggered profile popover (Slack-style): avatar, name, current
// status, and a "Message" button that opens (or creates) a DM. Rendered
// fixed-positioned near the clicked name/avatar; a full-screen backdrop closes it.
export function ProfileCard({
  user,
  currentUserId,
  x,
  y,
  onClose,
}: {
  user: CardUser;
  currentUserId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === currentUserId;

  async function message() {
    setBusy(true);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.channel?.id) {
        onClose();
        router.push(`/c/${data.channel.id}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-64 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-2xl"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar name={user.name} image={user.image} size={48} variant="solid" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {user.name ?? "Unknown"}
              {isSelf && <span className="ml-1 font-normal text-[var(--color-ink-soft)]">(you)</span>}
            </p>
            {statusActive(user) && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--color-ink-soft)]">
                {user.statusEmoji && (
                  <EmojiToken token={user.statusEmoji} imgClassName="inline-block h-3.5 w-3.5 object-contain" />
                )}
                {user.statusText && <span className="truncate">{user.statusText}</span>}
              </p>
            )}
          </div>
        </div>
        {!isSelf && (
          <button
            onClick={message}
            disabled={busy}
            className="mt-3 w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Message"}
          </button>
        )}
      </div>
    </>
  );
}
