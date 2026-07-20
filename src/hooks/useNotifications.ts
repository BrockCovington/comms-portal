"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

// Mirrors userChannelName() in @/lib/pusher — duplicated here (rather than
// imported) because that module also constructs the server-side Pusher
// client with the app secret, which must never enter the client bundle.
function userChannelName(userId: string): string {
  return `private-user-${userId}`;
}

export type NotificationType = "MENTION" | "DM" | "THREAD_REPLY" | "KEYWORD" | "CHANNEL" | "REMINDER";

export type AppNotification = {
  id: string;
  type: NotificationType;
  channelId: string;
  channelName: string;
  isDm: boolean;
  messageId: string;
  parentId: string | null;
  actorId: string;
  actorName: string;
  preview: string;
  createdAt: string;
  readAt: string | null;
};

export function useNotifications(currentUserId: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  // Always-current mirror of `notifications`, so markRead can synchronously
  // check prior read state without a stale closure over the state value.
  const notificationsRef = useRef<AppNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications as AppNotification[]);
      setUnreadCount(data.unreadCount ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();

    const channelName = userChannelName(currentUserId);
    const channel = subscribeChannel(channelName);

    const onNotification = (payload: AppNotification) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === payload.id)) return prev;
        return [payload, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
    };

    channel.bind("notification", onNotification);

    return () => {
      channel.unbind("notification", onNotification);
      unsubscribeChannel(channelName);
    };
  }, [currentUserId, refresh]);

  const loadMore = useCallback(async () => {
    if (!hasMore || notifications.length === 0) return;
    const cursor = notifications[notifications.length - 1].id;
    const res = await fetch(`/api/notifications?before=${cursor}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const older = data.notifications as AppNotification[];
    setHasMore(!!data.hasMore);
    setNotifications((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      return [...prev, ...older.filter((n) => !existingIds.has(n.id))];
    });
  }, [notifications, hasMore]);

  const markRead = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((n) => n.id === id);
    const wasUnread = !!target && !target.readAt;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))
    );
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {
      // Best-effort — a stale unread badge for a moment isn't worth surfacing.
    });
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, []);

  return { notifications, unreadCount, loading, hasMore, loadMore, markRead, markAllRead, refresh };
}
