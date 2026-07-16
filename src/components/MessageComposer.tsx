"use client";

import { useEffect, useRef, useState } from "react";
import { splitMentions } from "@/lib/mentions";
import { FullEmojiPicker } from "@/components/FullEmojiPicker";
import { Avatar } from "@/components/Avatar";

const DRAFT_SAVE_DEBOUNCE_MS = 1000;

type ComposerMember = { id: string; name: string | null; email: string; image: string | null };

// Matches a trailing "@query" at the cursor, up to two words — this app's
// display names are Google-OAuth "First Last", so two words covers a full
// name while still closing the dropdown once you've moved on to other text.
const MENTION_TRIGGER = /(?:^|\s)@([A-Za-z]*(?:\s[A-Za-z]*)?)$/;

const MAX_ATTACHMENTS = 5;

type PendingAttachment = {
  key: string;
  fileName: string;
  size: number;
  status: "uploading" | "done" | "error";
  id?: string;
  error?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageComposer({
  channelId,
  channelName,
  onSend,
  placeholder,
  members,
  onTyping,
  draftsEnabled,
  schedulingEnabled,
  onScheduled,
}: {
  channelId: string;
  channelName: string;
  onSend: (body: string, attachmentIds?: string[], mentionedUserIds?: string[]) => Promise<void>;
  placeholder?: string;
  members?: ComposerMember[];
  onTyping?: () => void;
  // Root-channel composer only — thread replies (ThreadPanel) don't opt in,
  // see the visual-overhaul plan's scope note.
  draftsEnabled?: boolean;
  // Also root-only: adds the "schedule for later" affordance next to Send.
  schedulingEnabled?: boolean;
  // Called after a message is successfully scheduled, so the parent can
  // refresh its pending-scheduled count.
  onScheduled?: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Load any existing draft when the channel changes, and flush a
  // pending debounced save if you navigate away mid-type.
  useEffect(() => {
    if (!draftsEnabled) return;
    let cancelled = false;
    fetch(`/api/channels/${channelId}/draft`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.body) setValue(data.body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (draftSaveTimer.current) {
        clearTimeout(draftSaveTimer.current);
        fetch(`/api/channels/${channelId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: valueRef.current }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, draftsEnabled]);

  function saveDraftDebounced(body: string) {
    if (!draftsEnabled) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      fetch(`/api/channels/${channelId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }).catch(() => {
        // Best-effort — losing a debounced draft save isn't worth surfacing.
      });
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }

  function clearDraft() {
    if (!draftsEnabled) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    fetch(`/api/channels/${channelId}/draft`, { method: "DELETE" }).catch(() => {});
  }

  const uploadingCount = attachments.filter((a) => a.status === "uploading").length;
  const readyAttachmentIds = attachments
    .filter((a): a is PendingAttachment & { status: "done"; id: string } => a.status === "done")
    .map((a) => a.id);

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  async function uploadFile(file: File) {
    const key = `${file.name}-${file.size}-${crypto.randomUUID()}`;
    setAttachments((prev) => [
      ...prev,
      { key, fileName: file.name, size: file.size, status: "uploading" },
    ]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/channels/${channelId}/files`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.key === key ? { ...a, status: "error", error: data.error ?? "Upload failed" } : a
          )
        );
        return;
      }
      setAttachments((prev) =>
        prev.map((a) => (a.key === key ? { ...a, status: "done", id: data.attachment.id } : a))
      );
    } catch {
      setAttachments((prev) =>
        prev.map((a) => (a.key === key ? { ...a, status: "error", error: "Network error" } : a))
      );
    }
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    const room = MAX_ATTACHMENTS - attachments.length;
    files.slice(0, room).forEach(uploadFile);
  }

  const candidates = mention
    ? (members ?? []).filter((m) => {
        const label = (m.name ?? m.email).toLowerCase();
        return label.includes(mention.query.toLowerCase());
      })
    : [];
  const mentionOpen = mention !== null && candidates.length > 0;

  // Derived from the final text at send time (not tracked at insertion)
  // so editing or deleting an inserted "@Name" before sending is handled
  // for free — reuses the same member-name matching MessageRow already
  // uses to render mentions, just mapped back to ids here.
  function computeMentionedUserIds(body: string): string[] | undefined {
    if (!members || members.length === 0) return undefined;
    const nameToId = new Map(members.map((m) => [m.name ?? m.email, m.id]));
    const ids = new Set(
      splitMentions(body, members.map((m) => m.name ?? m.email))
        .filter((f) => f.isMention)
        .map((f) => nameToId.get(f.text.slice(1))) // strip the leading "@"
        .filter((id): id is string => !!id)
    );
    return ids.size ? [...ids] : undefined;
  }

  async function submit() {
    const body = value.trim();
    if ((!body && readyAttachmentIds.length === 0) || sending || uploadingCount > 0) return;
    setSending(true);
    setError(null);
    try {
      await onSend(
        body,
        readyAttachmentIds.length ? readyAttachmentIds : undefined,
        computeMentionedUserIds(body)
      );
      setValue("");
      setAttachments([]);
      clearDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function scheduleSubmit(sendAt: Date) {
    const body = value.trim();
    if ((!body && readyAttachmentIds.length === 0) || sending || uploadingCount > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body || undefined,
          sendAt: sendAt.toISOString(),
          attachmentIds: readyAttachmentIds.length ? readyAttachmentIds : undefined,
          mentionedUserIds: computeMentionedUserIds(body),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't schedule");
        return;
      }
      setValue("");
      setAttachments([]);
      clearDraft();
      setScheduleOpen(false);
      onScheduled?.();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setValue(newValue);
    onTyping?.();
    saveDraftDebounced(newValue);

    if (!members || members.length === 0) return;
    const cursor = e.target.selectionStart ?? newValue.length;
    const match = MENTION_TRIGGER.exec(newValue.slice(0, cursor));
    if (match) {
      setMention({ start: cursor - match[1].length - 1, query: match[1] });
      setHighlightIndex(0);
    } else {
      setMention(null);
    }
  }

  function selectMention(member: ComposerMember) {
    if (!mention) return;
    const name = member.name ?? member.email;
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(cursor);
    const newValue = `${before}@${name} ${after}`;
    setValue(newValue);
    setMention(null);
    const pos = before.length + name.length + 2; // "@" + name + trailing space
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  // Insert a picked emoji token at the cursor. Custom emoji arrive as
  // ":name:" text, which the message renderer resolves to an image on send.
  function insertToken(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    saveDraftDebounced(next);
    const pos = start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(candidates[highlightIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--color-line)] p-4">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.key}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                a.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[var(--color-line)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
              }`}
            >
              {a.status === "uploading" && <span className="animate-pulse">Uploading…</span>}
              {a.status === "error" && <span>{a.error ?? "Failed"}</span>}
              <span className="max-w-40 truncate">{a.fileName}</span>
              {a.status === "done" && (
                <span className="text-[var(--color-ink-soft)]">{formatSize(a.size)}</span>
              )}
              <button
                onClick={() => removeAttachment(a.key)}
                aria-label={`Remove ${a.fileName}`}
                className="text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative rounded-lg border border-[var(--color-line)] focus-within:border-[var(--color-accent)]">
        {mentionOpen && (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-40 overflow-y-auto rounded-md border border-[var(--color-line)] bg-white shadow-lg">
            {candidates.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(m);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === highlightIndex ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                <Avatar name={m.name ?? m.email} image={m.image} size={20} />
                {m.name ?? m.email}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder ?? `Message #${channelName}`}
          className="block max-h-40 w-full resize-none rounded-lg px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              aria-label="Attach files"
              title="Attach files"
              className="rounded p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              📎
            </button>
            <div className="relative">
              <button
                onClick={() => setEmojiOpen((v) => !v)}
                aria-label="Insert emoji"
                title="Insert emoji"
                className="rounded p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                😊
              </button>
              {emojiOpen && (
                <FullEmojiPicker
                  placement="up"
                  onPick={(token) => insertToken(token)}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </div>
            <span className="text-xs text-[var(--color-ink-soft)]">
              Enter to send · Shift+Enter for a new line
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={submit}
              disabled={
                sending ||
                uploadingCount > 0 ||
                (value.trim().length === 0 && readyAttachmentIds.length === 0)
              }
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            {schedulingEnabled && (
              <div className="relative">
                <button
                  onClick={() => setScheduleOpen((v) => !v)}
                  disabled={
                    sending ||
                    uploadingCount > 0 ||
                    (value.trim().length === 0 && readyAttachmentIds.length === 0)
                  }
                  aria-label="Schedule for later"
                  title="Schedule for later"
                  className="rounded-md bg-[var(--color-accent)] px-2 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  🕐
                </button>
                {scheduleOpen && (
                  <ScheduleMenu onPick={scheduleSubmit} onClose={() => setScheduleOpen(false)} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const SCHEDULE_PRESETS: { label: string; at: () => Date }[] = [
  { label: "In 30 minutes", at: () => new Date(Date.now() + 30 * 60_000) },
  { label: "In 1 hour", at: () => new Date(Date.now() + 60 * 60_000) },
  { label: "In 3 hours", at: () => new Date(Date.now() + 3 * 60 * 60_000) },
  {
    label: "Tomorrow at 9 AM",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

// Opens upward from the composer (which sits at the viewport bottom).
function ScheduleMenu({ onPick, onClose }: { onPick: (d: Date) => void; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full right-0 z-50 mb-1 w-56 rounded-md border border-[var(--color-line)] bg-white p-1 text-[var(--color-ink)] shadow-lg">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Schedule message
        </p>
        {SCHEDULE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onPick(p.at())}
            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
          >
            {p.label}
          </button>
        ))}
        <div className="mt-1 border-t border-[var(--color-line)] px-2 pt-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Custom time
          </label>
          <input
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--color-line)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={() => {
              if (!custom) return;
              const d = new Date(custom); // datetime-local parses as local time
              if (!Number.isNaN(d.getTime())) onPick(d);
            }}
            disabled={!custom}
            className="mt-1 w-full rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Schedule
          </button>
        </div>
      </div>
    </>
  );
}
