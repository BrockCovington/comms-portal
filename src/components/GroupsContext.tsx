"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type GroupItem = { id: string; handle: string; name: string; memberCount: number };

type GroupsContextValue = {
  groups: GroupItem[];
  // Lowercase handles, for highlighting "@handle" in rendered messages.
  handles: string[];
  refresh: () => Promise<void>;
};

const GroupsContext = createContext<GroupsContextValue>({
  groups: [],
  handles: [],
  refresh: async () => {},
});

// User groups are workspace-global, so they're fetched once and shared via
// context (like custom emoji) rather than re-fetched per message/composer.
// Seeded from the server to avoid a flash; refresh()ed after admin edits.
export function GroupsProvider({
  initialGroups,
  children,
}: {
  initialGroups: GroupItem[];
  children: React.ReactNode;
}) {
  const [groups, setGroups] = useState<GroupItem[]>(initialGroups);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/groups", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      // Non-fatal — keep whatever we had.
    }
  }, []);

  const value = useMemo<GroupsContextValue>(
    () => ({ groups, handles: groups.map((g) => g.handle), refresh }),
    [groups, refresh]
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  return useContext(GroupsContext);
}
