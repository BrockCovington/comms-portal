"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { subscribeChannel, unsubscribeChannel } from "@/lib/pusherClient";

const WORKSPACE_PRESENCE_CHANNEL = "presence-workspace";

export type PresenceStatus = "online" | "away" | "offline";

type PresenceContextValue = {
  onlineIds: Set<string>;
  awayIds: Set<string>;
  status: (userId: string) => PresenceStatus;
};

const PresenceContext = createContext<PresenceContextValue>({
  onlineIds: new Set(),
  awayIds: new Set(),
  status: () => "offline",
});

// App-wide presence: every signed-in client joins one workspace presence
// channel, so "who's online" is known everywhere (Pusher's own membership
// bookkeeping — no polling). "Away" is relayed via POST /api/presence when a
// tab is hidden/idle. Exposed as a status(userId) any avatar can read.
export function PresenceProvider({ currentUserId, children }: { currentUserId: string; children: React.ReactNode }) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [awayIds, setAwayIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = subscribeChannel(WORKSPACE_PRESENCE_CHANNEL);

    const onSubscribed = (members: { each: (cb: (m: { id: string }) => void) => void }) => {
      const ids = new Set<string>();
      members.each((m) => ids.add(m.id));
      setOnlineIds(ids);
    };
    const onAdded = (m: { id: string }) => setOnlineIds((prev) => new Set(prev).add(m.id));
    const onRemoved = (m: { id: string }) => {
      setOnlineIds((prev) => { const n = new Set(prev); n.delete(m.id); return n; });
      setAwayIds((prev) => { const n = new Set(prev); n.delete(m.id); return n; });
    };
    const onChanged = (p: { userId: string; away: boolean }) => {
      setAwayIds((prev) => {
        const n = new Set(prev);
        if (p.away) n.add(p.userId);
        else n.delete(p.userId);
        return n;
      });
    };

    channel.bind("pusher:subscription_succeeded", onSubscribed);
    channel.bind("pusher:member_added", onAdded);
    channel.bind("pusher:member_removed", onRemoved);
    channel.bind("presence-changed", onChanged);

    // Relay our own active/away state from tab visibility.
    const report = (away: boolean) =>
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ away }),
        keepalive: true,
      }).catch(() => {});
    const onVisibility = () => report(document.visibilityState === "hidden");
    report(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      channel.unbind("pusher:subscription_succeeded", onSubscribed);
      channel.unbind("pusher:member_added", onAdded);
      channel.unbind("pusher:member_removed", onRemoved);
      channel.unbind("presence-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeChannel(WORKSPACE_PRESENCE_CHANNEL);
    };
  }, [currentUserId]);

  const value = useMemo<PresenceContextValue>(
    () => ({
      onlineIds,
      awayIds,
      status: (id) => (!onlineIds.has(id) ? "offline" : awayIds.has(id) ? "away" : "online"),
    }),
    [onlineIds, awayIds]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  return useContext(PresenceContext);
}
