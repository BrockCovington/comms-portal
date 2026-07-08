"use client";

import { useState } from "react";
import Link from "next/link";
import type { DmThreadSummary } from "@/lib/dms";
import { NewDmPicker } from "@/components/NewDmPicker";

function relativeTime(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Replaces the normal channel sidebar while you're in the DMs section (see
// Sidebar.tsx's inDmContext) — a dedicated list of DM conversations with a
// last-message preview, matching Slack's own "Direct messages" column
// instead of the plain name-only list the regular sidebar shows.
export function DmListColumn({
  dmThreads,
  activeChannelId,
  onNavigate,
}: {
  dmThreads: DmThreadSummary[];
  activeChannelId: string | null;
  onNavigate: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-sm font-semibold text-[var(--color-on-sidebar)]">Direct messages</h2>
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded px-1 text-[var(--color-on-sidebar-dim)] hover:text-white"
            aria-label="Start a direct message"
            title="Start a direct message"
          >
            ✎
          </button>
          {pickerOpen && <NewDmPicker onClose={() => setPickerOpen(false)} />}
        </div>
      </div>

      <ul className="space-y-0.5">
        {dmThreads.map((t) => {
          const active = t.channelId === activeChannelId;
          return (
            <li key={t.channelId}>
              <Link
                href={`/c/${t.channelId}`}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-md px-2 py-2 transition ${
                  active
                    ? "bg-[var(--color-sidebar-active)] text-white"
                    : "text-[var(--color-on-sidebar)] hover:bg-white/10"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${t.hasUnread ? "font-semibold text-white" : ""}`}>
                      {t.name}
                    </span>
                    {t.lastMessageAt && (
                      <span className="shrink-0 text-[10px] text-[var(--color-on-sidebar-dim)]">
                        {relativeTime(t.lastMessageAt)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      t.hasUnread && !active
                        ? "font-medium text-[var(--color-on-sidebar)]"
                        : "text-[var(--color-on-sidebar-dim)]"
                    }`}
                  >
                    {t.lastMessagePreview
                      ? `${t.lastMessageIsMine ? "You: " : ""}${t.lastMessagePreview}`
                      : "No messages yet"}
                  </span>
                </span>
                {t.hasUnread && !active && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                )}
              </Link>
            </li>
          );
        })}
        {dmThreads.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">
            No direct messages yet
          </li>
        )}
      </ul>
    </nav>
  );
}
