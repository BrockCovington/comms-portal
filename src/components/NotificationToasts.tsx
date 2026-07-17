"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";
import type { AppNotification } from "@/hooks/useNotifications";
import { describeNotification } from "@/lib/notifications";

// Mirrors userChannelName() in @/lib/pusher — duplicated (not imported) for
// the same reason useNotifications.ts does: that module also constructs the
// server-side Pusher client with the app secret, which must never enter the
// client bundle.
function userChannelName(userId: string): string {
  return `private-user-${userId}`;
}

const TOAST_DURATION_MS = 5000;

// Mounted once, globally (src/app/(app)/layout.tsx), independent of
// IconRail's own subscription to the same per-user channel for its unread
// badge — cheap thanks to pusherClient's ref-counting, and keeps this
// component self-contained rather than threading shared state through the tree.
export function NotificationToasts({ currentUserId }: { currentUserId: string }) {
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const channelName = userChannelName(currentUserId);
    const channel = subscribeChannel(channelName);

    const onNotification = (payload: AppNotification) => {
      // Already looking at the source — no reason to surface a toast or
      // leave it sitting unread.
      if (pathname === `/c/${payload.channelId}`) {
        fetch(`/api/notifications/${payload.id}/read`, { method: "PATCH" }).catch(() => {});
        return;
      }
      setToasts((prev) => [...prev, payload]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== payload.id));
      }, TOAST_DURATION_MS);
    };

    channel.bind("notification", onNotification);
    return () => {
      channel.unbind("notification", onNotification);
      unsubscribeChannel(channelName);
    };
    // pathname is read fresh via closure each time a new binding is set up
    // below, so it must be a dependency — a stale pathname would keep
    // suppressing toasts for a channel you've since navigated away from.
  }, [currentUserId, pathname]);

  function handleClick(n: AppNotification) {
    setToasts((prev) => prev.filter((t) => t.id !== n.id));
    fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    const params = new URLSearchParams({ message: n.messageId });
    if (n.parentId) params.set("thread", n.parentId);
    router.push(`/c/${n.channelId}?${params.toString()}`);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((n) => (
        <button
          key={n.id}
          onClick={() => handleClick(n)}
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-left shadow-lg hover:bg-[var(--color-accent-soft)]"
        >
          <p className="text-xs text-[var(--color-ink)]">
            <span className="font-semibold">{n.actorName}</span> {describeNotification(n)}
          </p>
          {n.preview && (
            <p className="mt-0.5 truncate text-sm text-[var(--color-ink-soft)]">{n.preview}</p>
          )}
        </button>
      ))}
    </div>
  );
}
