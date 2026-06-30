"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/useMessages";

export function MessageList({
  messages,
  loading,
  currentUserId,
}: {
  messages: ChatMessage[];
  loading: boolean;
  currentUserId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
        Loading messages…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
        No messages yet. Say hello.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <ul className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
              {(m.user.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-[var(--color-ink)]">
                  {m.user.id === currentUserId ? "You" : m.user.name ?? "Unknown"}
                </span>
                <time className="text-xs text-[var(--color-ink-soft)]">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]">
                {m.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
