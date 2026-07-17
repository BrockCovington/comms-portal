"use client";

import { EmojiToken } from "@/components/EmojiToken";

// The little status emoji shown next to a person's name. Renders nothing when
// there's no emoji or the status has expired. The full status text is exposed
// as a tooltip. Custom emoji render as their image (via EmojiToken).
export function StatusBadge({
  emoji,
  text,
  expiresAt,
  className = "inline-block h-3.5 w-3.5 object-contain align-text-bottom",
}: {
  emoji?: string | null;
  text?: string | null;
  expiresAt?: string | Date | null;
  className?: string;
}) {
  if (!emoji) return null;
  if (expiresAt) {
    const t = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
    if (t <= Date.now()) return null;
  }
  return (
    <span className="shrink-0 leading-none" title={text ?? undefined} aria-label={text ?? "status"}>
      <EmojiToken token={emoji} imgClassName={className} />
    </span>
  );
}
