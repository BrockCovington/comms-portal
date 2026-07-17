"use client";

import { useQuickReactions } from "@/components/QuickReactionsProvider";
import { EmojiToken } from "@/components/EmojiToken";
import { EmojiBrowser } from "@/components/EmojiBrowser";

const MAX = 8;

// Centered modal for customizing the huddle quick-reaction set. Full Unicode
// set + custom emoji (via EmojiBrowser) to fill up to 8 slots. Centered/fixed
// so it's never clipped by the floating dock's overflow. Every change saves
// immediately (optimistic) through the shared QuickReactions context.
export function HuddleReactionsEditor({ onClose }: { onClose: () => void }) {
  const { reactions, save } = useQuickReactions();

  const remove = (token: string) => save(reactions.filter((r) => r !== token));
  const add = (token: string) => {
    if (reactions.includes(token) || reactions.length >= MAX) return;
    save([...reactions, token]);
  };

  const full = reactions.length >= MAX;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Huddle reactions</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
            Your quick reactions ({reactions.length}/{MAX}) — click one to remove it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {reactions.map((token) => (
              <button
                key={token}
                onClick={() => remove(token)}
                title="Remove"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-line)] text-lg leading-none hover:border-red-300 hover:bg-red-50"
              >
                <EmojiToken token={token} imgClassName="inline-block h-6 w-6 object-contain" />
              </button>
            ))}
            {reactions.length === 0 && (
              <span className="text-xs text-[var(--color-ink-soft)]">None yet — add some below.</span>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--color-line)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          {full ? "Remove one to add another" : "Add from any emoji — standard or custom"}
        </div>
        <EmojiBrowser
          onPick={add}
          className={`h-72 border-t border-[var(--color-line)] ${full ? "pointer-events-none opacity-50" : ""}`}
        />
      </div>
    </div>
  );
}
