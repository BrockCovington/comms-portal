"use client";

import { useRouter } from "next/navigation";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { describeNotification } from "@/lib/notifications";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Replaces the normal channel sidebar while on /activity — condensed
// version of ActivityFeed's list, same useNotifications hook (live via
// Pusher), just narrower to fit the column.
export function ActivityListColumn({
  currentUserId,
  onNavigate,
}: {
  currentUserId: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { notifications, unreadCount, loading, hasMore, loadMore, markRead, markAllRead } =
    useNotifications(currentUserId);

  function goToNotification(n: AppNotification) {
    onNavigate();
    if (!n.readAt) markRead(n.id);
    const params = new URLSearchParams({ message: n.messageId });
    if (n.parentId) params.set("thread", n.parentId);
    router.push(`/c/${n.channelId}?${params.toString()}`);
  }

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-sm font-semibold text-[var(--color-on-sidebar)]">Activity</h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[10px] font-medium text-[var(--color-on-sidebar-dim)] hover:text-white"
          >
            Mark all read
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {notifications.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => goToNotification(n)}
              className={`block w-full rounded-md px-2 py-2 text-left transition ${
                n.readAt ? "text-[var(--color-on-sidebar)] hover:bg-white/10" : "bg-white/10 text-white"
              }`}
            >
              <div className="flex items-start gap-1.5">
                {!n.readAt && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    <span className="font-semibold">{n.actorName}</span> {describeNotification(n)}
                  </p>
                  {n.preview && (
                    <p className="mt-0.5 truncate text-[10px] text-[var(--color-on-sidebar-dim)]">
                      {n.preview}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-[var(--color-on-sidebar-dim)]">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
            </button>
          </li>
        ))}
        {!loading && notifications.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">Nothing yet</li>
        )}
      </ul>
      {hasMore && (
        <button
          onClick={loadMore}
          className="mt-2 w-full rounded px-2 py-1 text-xs font-medium text-[var(--color-on-sidebar-dim)] hover:text-white"
        >
          Load earlier
        </button>
      )}
    </nav>
  );
}
