"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SavedMessageSummary } from "@/lib/saved";

function relativeTime(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Replaces the normal channel sidebar while on /later — same pattern as
// DmListColumn/ThreadListColumn. Reuses the existing ?message=&thread=
// resolution for navigating back to a saved message in context.
export function LaterListColumn({
  saved,
  onNavigate,
}: {
  saved: SavedMessageSummary[];
  onNavigate: () => void;
}) {
  const searchParams = useSearchParams();
  const activeMessageId = searchParams.get("message");

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <h2 className="mb-2 px-2 text-sm font-semibold text-[var(--color-on-sidebar)]">Later</h2>
      <ul className="space-y-0.5">
        {saved.map((s) => {
          const active = s.messageId === activeMessageId;
          const params = new URLSearchParams({ message: s.messageId });
          if (s.parentId) params.set("thread", s.parentId);
          return (
            <li key={s.messageId}>
              <Link
                href={`/c/${s.channelId}?${params.toString()}`}
                onClick={onNavigate}
                className={`block rounded-md px-2 py-2 transition ${
                  active
                    ? "bg-[var(--color-sidebar-active)] text-white"
                    : "text-[var(--color-on-sidebar)] hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-sidebar-dim)]">
                  <span className="truncate font-medium">
                    {s.isDm ? "" : "#"}
                    {s.channelName}
                  </span>
                  <span className="shrink-0">· saved {relativeTime(s.savedAt)}</span>
                </div>
                <p className={`mt-0.5 truncate text-xs ${active ? "text-white" : "text-[var(--color-on-sidebar-dim)]"}`}>
                  {s.authorName ?? "Someone"}: {s.preview || "(no preview)"}
                </p>
              </Link>
            </li>
          );
        })}
        {saved.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">
            Nothing saved yet — use "Save for later" on any message.
          </li>
        )}
      </ul>
    </nav>
  );
}
