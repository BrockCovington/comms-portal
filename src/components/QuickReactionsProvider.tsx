"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { REACTION_EMOJIS } from "@/lib/reactions";

type QuickReactionsContextValue = {
  // The user's huddle quick-reaction set (the "main 8"). Always non-empty.
  reactions: string[];
  // Persist a new set (optimistic; PUTs to the server).
  save: (next: string[]) => Promise<void>;
};

const QuickReactionsContext = createContext<QuickReactionsContextValue>({
  reactions: [...REACTION_EMOJIS],
  save: async () => {},
});

// Holds the user's customizable huddle quick-reactions, seeded from the server
// (in the app layout) to avoid a flash. Mounted app-wide so both the huddle
// react picker (in the floating dock) and the editor share one source of truth.
export function QuickReactionsProvider({
  initial,
  children,
}: {
  initial: string[];
  children: React.ReactNode;
}) {
  const [reactions, setReactions] = useState<string[]>(
    initial.length > 0 ? initial : [...REACTION_EMOJIS]
  );

  const save = useCallback(async (next: string[]) => {
    setReactions(next); // optimistic
    try {
      const res = await fetch("/api/huddle-reactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactions: next }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reactions)) setReactions(data.reactions);
      }
    } catch {
      // Best-effort — the optimistic value stays; a reload re-syncs.
    }
  }, []);

  return (
    <QuickReactionsContext.Provider value={{ reactions, save }}>
      {children}
    </QuickReactionsContext.Provider>
  );
}

export function useQuickReactions() {
  return useContext(QuickReactionsContext);
}
