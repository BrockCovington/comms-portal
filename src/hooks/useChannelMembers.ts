"use client";

import { useCallback, useEffect, useState } from "react";

export type ChannelMember = {
  userId: string;
  user: { id: string; name: string | null; email: string; image: string | null };
};

export function useChannelMembers(channelId: string) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMembers(data.members as ChannelMember[]);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const addMember = useCallback(
    async (userId: string) => {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't add member");
      }
      const data = await res.json();
      setMembers((prev) => {
        if (prev.some((m) => m.userId === data.member.userId)) return prev;
        return [...prev, data.member as ChannelMember];
      });
    },
    [channelId]
  );

  const joinChannel = useCallback(async () => {
    const res = await fetch(`/api/channels/${channelId}/join`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't join channel");
    }
    // The join route doesn't return member info to append optimistically —
    // a refetch is simpler and just as fast.
    await refresh();
  }, [channelId, refresh]);

  const leaveChannel = useCallback(async () => {
    const res = await fetch(`/api/channels/${channelId}/members`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't leave channel");
    }
    await refresh();
  }, [channelId, refresh]);

  // Admin-only override — removes someone else, unlike leaveChannel which is
  // self-only. Hits a separate admin-gated route (see
  // /api/channels/[channelId]/members/[userId]).
  const removeMember = useCallback(
    async (userId: string) => {
      const res = await fetch(`/api/channels/${channelId}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't remove member");
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    },
    [channelId]
  );

  const archiveChannel = useCallback(async () => {
    const res = await fetch(`/api/channels/${channelId}/archive`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't archive channel");
    }
  }, [channelId]);

  const unarchiveChannel = useCallback(async () => {
    const res = await fetch(`/api/channels/${channelId}/archive`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't unarchive channel");
    }
  }, [channelId]);

  return {
    members,
    loading,
    addMember,
    joinChannel,
    leaveChannel,
    removeMember,
    archiveChannel,
    unarchiveChannel,
  };
}
