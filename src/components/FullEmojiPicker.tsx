"use client";

import { EmojiBrowser } from "@/components/EmojiBrowser";

// The full emoji picker popover: backdrop + anchored panel wrapping the shared
// EmojiBrowser. Returns a token — a raw unicode grapheme ("🎉") for standard
// emoji, or ":name:" for a custom one. Reactions and the composer both accept
// either. Closes after a pick.
export function FullEmojiPicker({
  onPick,
  onClose,
  placement = "down",
}: {
  onPick: (token: string) => void;
  onClose: () => void;
  // "up" opens the panel above the trigger — for the composer, which sits at
  // the bottom of the viewport where a downward panel would clip off-screen.
  placement?: "up" | "down";
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <EmojiBrowser
        onPick={(token) => {
          onPick(token);
          onClose();
        }}
        className={`absolute right-0 z-50 h-96 w-80 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] shadow-lg ${
          placement === "up" ? "bottom-full mb-1" : "top-full mt-1"
        }`}
      />
    </>
  );
}
