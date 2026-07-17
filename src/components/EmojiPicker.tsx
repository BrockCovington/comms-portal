"use client";

import { useState } from "react";
import { useQuickReactions } from "@/components/QuickReactionsProvider";
import { EmojiToken } from "@/components/EmojiToken";
import { HuddleReactionsEditor } from "@/components/HuddleReactionsEditor";

// The huddle quick-react popover: the user's customizable set of reactions
// (standard or custom emoji), plus a ✏️ to open the full customization editor.
// Opens upward — it lives in the floating dock near the bottom of the screen.
export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const { reactions } = useQuickReactions();
  const [editing, setEditing] = useState(false);

  return (
    <>
      {/* Same click-outside-to-close backdrop pattern used elsewhere. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full right-0 z-50 mb-1 flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 shadow-lg">
        {reactions.map((token) => (
          <button
            key={token}
            onClick={() => {
              onPick(token);
              onClose();
            }}
            className="rounded p-1 text-lg leading-none hover:bg-[var(--color-accent-soft)]"
          >
            <EmojiToken token={token} imgClassName="inline-block h-5 w-5 object-contain" />
          </button>
        ))}
        <button
          onClick={() => setEditing(true)}
          title="Customize reactions"
          aria-label="Customize reactions"
          className="ml-0.5 rounded p-1 text-sm text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
        >
          ✏️
        </button>
      </div>
      {editing && <HuddleReactionsEditor onClose={() => setEditing(false)} />}
    </>
  );
}
