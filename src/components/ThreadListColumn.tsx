"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ThreadSummary } from "@/lib/threads";

function relativeTime(date: Date | string | null): string {
  if (!date) return "";
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Replaces the normal channel sidebar while on /threads — same "dedicated
// column" pattern as DmListColumn. Clicking a thread reuses the existing
// ?thread=&message= resolution ChannelView already handles, so it lands in
// the regular channel view with the thread panel open.
export function ThreadListColumn({
  threads,
  onNavigate,
}: {
  threads: ThreadSummary[];
  onNavigate: () => void;
}) {
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("thread");

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <h2 className="mb-2 px-2 text-sm font-semibold text-[var(--color-on-sidebar)]">Threads</h2>
      <ul className="space-y-0.5">
        {threads.map((t) => {
          const active = t.id === activeThreadId;
          return (
            <li key={t.id}>
              <Link
                href={`/c/${t.channelId}?thread=${t.id}&message=${t.id}`}
                onClick={onNavigate}
                className={`block rounded-md px-2 py-2 transition ${
                  active
                    ? "bg-[var(--color-sidebar-active)] text-white"
                    : "text-[var(--color-on-sidebar)] hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-sidebar-dim)]">
                  {t.unread && !active && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-surface)]" />
                  )}
                  <span className="truncate font-medium">
                    {t.isDm ? "" : "#"}
                    {t.channelName}
                  </span>
                  <span className="shrink-0">
                    · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                  </span>
                  {t.lastReplyAt && <span className="shrink-0">· {relativeTime(t.lastReplyAt)}</span>}
                </div>
                <p
                  className={`mt-0.5 truncate text-xs ${
                    t.unread && !active
                      ? "font-semibold text-white"
                      : active
                        ? "text-white"
                        : "text-[var(--color-on-sidebar-dim)]"
                  }`}
                >
                  {t.authorName ?? "Someone"}: {t.preview || "(no preview)"}
                </p>
              </Link>
            </li>
          );
        })}
        {threads.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No threads yet</li>
        )}
      </ul>
    </nav>
  );
}
