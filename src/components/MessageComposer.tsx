"use client";

import { useState } from "react";

export function MessageComposer({
  channelName,
  onSend,
}: {
  channelName: string;
  onSend: (body: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--color-line)] p-4">
      <div className="rounded-lg border border-[var(--color-line)] focus-within:border-[var(--color-accent)]">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={`Message #${channelName}`}
          className="block max-h-40 w-full resize-none rounded-lg px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-xs text-[var(--color-ink-soft)]">
            Enter to send · Shift+Enter for a new line
          </span>
          <button
            onClick={submit}
            disabled={sending || value.trim().length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
