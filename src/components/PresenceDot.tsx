"use client";

import { usePresence } from "@/components/PresenceContext";

// A small online/away indicator for a user. Renders nothing when offline.
// Meant to be overlaid on the bottom-right of an avatar (wrap the avatar in a
// `relative` container). `ring` matches the surface the avatar sits on so the
// dot reads as a distinct badge.
export function PresenceDot({
  userId,
  className = "",
  ring = "ring-[var(--color-surface)]",
  size = 10,
}: {
  userId: string;
  className?: string;
  ring?: string;
  size?: number;
}) {
  const { status } = usePresence();
  const s = status(userId);
  if (s === "offline") return null;
  return (
    <span
      aria-label={s === "online" ? "Online" : "Away"}
      title={s === "online" ? "Active" : "Away"}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 rounded-full ring-2 ${ring} ${
        s === "online" ? "bg-green-500" : "border-2 border-green-500 bg-[var(--color-surface)]"
      } ${className}`}
    />
  );
}
