"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DraftSummary } from "@/lib/drafts";

function relativeTime(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Replaces the normal channel sidebar while on /drafts. A draft doesn't
// target a specific message, so it just links to the channel — the
// composer there auto-loads the saved draft (see MessageComposer.tsx).
export function DraftsListColumn({
  drafts,
  onNavigate,
}: {
  drafts: DraftSummary[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <h2 className="mb-2 px-2 text-sm font-semibold text-[var(--color-on-sidebar)]">Drafts & sent</h2>
      <ul className="space-y-0.5">
        {drafts.map((d) => {
          const active = pathname === `/c/${d.channelId}`;
          return (
            <li key={d.channelId}>
              <Link
                href={`/c/${d.channelId}`}
                onClick={onNavigate}
                className={`block rounded-md px-2 py-2 transition ${
                  active
                    ? "bg-[var(--color-sidebar-active)] text-white"
                    : "text-[var(--color-on-sidebar)] hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-sidebar-dim)]">
                  <span className="truncate font-medium">
                    {d.isDm ? "" : "#"}
                    {d.channelName}
                  </span>
                  <span className="shrink-0">· {relativeTime(d.updatedAt)}</span>
                </div>
                <p className={`mt-0.5 truncate text-xs ${active ? "text-white" : "text-[var(--color-on-sidebar-dim)]"}`}>
                  {d.preview || "(empty draft)"}
                </p>
              </Link>
            </li>
          );
        })}
        {drafts.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No drafts yet</li>
        )}
      </ul>
    </nav>
  );
}
