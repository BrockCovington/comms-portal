"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CustomEmojiItem = { id: string; name: string; url: string };

type CustomEmojiContextValue = {
  emoji: CustomEmojiItem[];
  // name (no colons) -> image URL, for fast :shortcode: / reaction resolution.
  byName: Map<string, string>;
  refresh: () => Promise<void>;
};

const CustomEmojiContext = createContext<CustomEmojiContextValue>({
  emoji: [],
  byName: new Map(),
  refresh: async () => {},
});

// Custom emoji are workspace-global, so they're fetched once and shared via
// context rather than re-fetched per message/picker. Seeded from the server
// (initialEmoji) to avoid a flash, and refresh()ed after an add/remove.
export function CustomEmojiProvider({
  initialEmoji,
  children,
}: {
  initialEmoji: CustomEmojiItem[];
  children: React.ReactNode;
}) {
  const [emoji, setEmoji] = useState<CustomEmojiItem[]>(initialEmoji);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/emoji", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setEmoji(data.emoji ?? []);
    } catch {
      // Non-fatal — keep whatever we had.
    }
  }, []);

  const value = useMemo<CustomEmojiContextValue>(
    () => ({
      emoji,
      byName: new Map(emoji.map((e) => [e.name, e.url])),
      refresh,
    }),
    [emoji, refresh]
  );

  return <CustomEmojiContext.Provider value={value}>{children}</CustomEmojiContext.Provider>;
}

export function useCustomEmoji() {
  return useContext(CustomEmojiContext);
}
