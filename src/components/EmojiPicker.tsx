"use client";

import { REACTION_EMOJIS } from "@/lib/reactions";

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Same click-outside-to-close backdrop pattern used by NewDmPicker/AddMembersPanel. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 flex gap-1 rounded-md border border-[var(--color-line)] bg-white p-1.5 shadow-lg">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onPick(emoji);
              onClose();
            }}
            className="rounded p-1 text-lg leading-none hover:bg-[var(--color-accent-soft)]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
