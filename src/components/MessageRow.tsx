"use client";

import { useState } from "react";
import type { ChatMessage, LinkPreview } from "@/hooks/useMessages";
import { renderRichText, type RichSegment } from "@/lib/richtext";
import { EmojiPicker } from "@/components/EmojiPicker";

const INLINE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Slack-style unfurl card: a left accent bar, site name + title (linked) and
// description, with the OG image as a thumbnail on the right if present.
function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const { url, title, description, imageUrl, siteName } = preview;
  return (
    <div className="mt-1.5 flex max-w-lg gap-3 rounded-r-md border-l-4 border-[var(--color-line)] bg-[var(--color-accent-soft)]/30 py-1.5 pl-3 pr-2">
      <div className="min-w-0 flex-1">
        {siteName && <p className="truncate text-xs text-[var(--color-ink-soft)]">{siteName}</p>}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          {title ?? url}
        </a>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-ink-soft)]">{description}</p>
        )}
      </div>
      {imageUrl && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="h-16 w-16 rounded object-cover"
            onError={(e) => {
              // A broken/blocked OG image shouldn't leave a broken-image icon.
              e.currentTarget.style.display = "none";
            }}
          />
        </a>
      )}
    </div>
  );
}

function renderSegments(segments: RichSegment[]) {
  return segments.map((seg, i) => {
    switch (seg.kind) {
      case "mention":
        return (
          <span
            key={i}
            className="rounded bg-[var(--color-accent-soft)] px-1 font-medium text-[var(--color-accent)]"
          >
            {seg.text}
          </span>
        );
      case "bold":
        return <strong key={i}>{seg.text}</strong>;
      case "italic":
        return <em key={i}>{seg.text}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-[var(--color-accent-soft)] px-1 py-0.5 text-[0.85em]">
            {seg.text}
          </code>
        );
      default:
        return <span key={i}>{seg.text}</span>;
    }
  });
}

function RichBody({ body, memberNames }: { body: string; memberNames: string[] }) {
  const blocks = renderRichText(body, memberNames);
  return (
    <div className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]">
      {blocks.map((block, i) =>
        block.type === "bullet" ? (
          <ul key={i} className="my-0.5 list-disc pl-5">
            {block.items.map((item, j) => (
              <li key={j}>{renderSegments(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderSegments(line)}
              </span>
            ))}
          </p>
        )
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function MessageRow({
  message,
  currentUserId,
  onOpenThread,
  isActiveThread,
  onEdit,
  onDelete,
  memberNames,
  onToggleReaction,
  onToggleSave,
  onTogglePin,
  htmlId,
  isHighlighted,
}: {
  message: ChatMessage;
  currentUserId: string;
  onOpenThread?: (messageId: string) => void;
  isActiveThread?: boolean;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  memberNames?: string[];
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onToggleSave?: (messageId: string) => Promise<void>;
  onTogglePin?: (messageId: string) => Promise<void>;
  htmlId?: string;
  isHighlighted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isDeleted = !!message.deletedAt;
  const isMine = message.user.id === currentUserId;
  const showThreadUnread = message.threadUnread && !isActiveThread;

  function startEdit() {
    setDraft(message.body);
    setActionError(null);
    setEditing(true);
  }

  async function submitEdit() {
    const body = draft.trim();
    if (!body || !onEdit) return;
    setSaving(true);
    setActionError(null);
    try {
      await onEdit(message.id, body);
      setEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    setActionError(null);
    try {
      await onDelete(message.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  // A tombstone with no replies has nothing to open — everything else opens
  // (or starts) its thread when you click anywhere on the row.
  const rowOpensThread = !!onOpenThread && !editing && !(isDeleted && (message.replyCount ?? 0) === 0);

  function handleRowClick(e: React.MouseEvent<HTMLLIElement>) {
    if (!rowOpensThread) return;
    // Don't hijack clicks on buttons/links/the edit textarea, or the mouseup
    // that ends a text-selection drag.
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, a")) return;
    if (window.getSelection()?.toString()) return;
    onOpenThread!(message.id);
  }

  return (
    <li
      id={htmlId}
      onClick={handleRowClick}
      className={`group flex gap-3 rounded-md px-2 py-1 -mx-2 transition-colors duration-1000 ${
        isHighlighted
          ? "bg-yellow-100"
          : isActiveThread
            ? "bg-[var(--color-accent-soft)]"
            : ""
      } ${rowOpensThread ? "cursor-pointer" : ""}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
        {(message.user.name ?? "?").charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--color-ink)]">
            {isMine ? "You" : message.user.name ?? "Unknown"}
          </span>
          <time className="text-xs text-[var(--color-ink-soft)]">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {message.editedAt && !isDeleted && (
            <span className="text-xs text-[var(--color-ink-soft)]">(edited)</span>
          )}
          {message.isPinned && !isDeleted && (
            <span aria-label="Pinned" title="Pinned to channel" className="text-xs">
              📌
            </span>
          )}
          {message.savedByMe && !isDeleted && (
            <span aria-label="Saved for later" title="Saved for later" className="text-xs">
              🔖
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {isMine && !isDeleted && !editing && onEdit && (
              <button
                onClick={startEdit}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                Edit
              </button>
            )}
            {isMine && !isDeleted && onDelete && (
              <button
                onClick={handleDelete}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
              >
                Delete
              </button>
            )}
            {onOpenThread && !isDeleted && (
              <button
                onClick={() => onOpenThread(message.id)}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              >
                Reply in thread
              </button>
            )}
            {onToggleReaction && !isDeleted && (
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  className="rounded px-1.5 py-0.5 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                >
                  + react
                </button>
                {pickerOpen && (
                  <EmojiPicker
                    onPick={(emoji) => onToggleReaction(message.id, emoji)}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
            )}
            {onToggleSave && !isDeleted && (
              <button
                onClick={() => onToggleSave(message.id)}
                className={`rounded px-1.5 py-0.5 text-xs hover:bg-[var(--color-accent-soft)] ${
                  message.savedByMe
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
                }`}
              >
                {message.savedByMe ? "Saved" : "Save for later"}
              </button>
            )}
            {onTogglePin && !isDeleted && (
              <button
                onClick={() => onTogglePin(message.id)}
                className={`rounded px-1.5 py-0.5 text-xs hover:bg-[var(--color-accent-soft)] ${
                  message.isPinned
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
                }`}
              >
                {message.isPinned ? "Unpin" : "Pin"}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              rows={2}
              className="block w-full resize-none rounded-md border border-[var(--color-accent)] px-2 py-1 text-sm text-[var(--color-ink)] outline-none"
            />
            <div className="mt-1 flex gap-3 text-xs">
              <button
                onClick={submitEdit}
                disabled={saving || draft.trim().length === 0}
                className="font-medium text-[var(--color-accent)] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-[var(--color-ink-soft)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isDeleted ? (
          <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]">
            <span className="italic text-[var(--color-ink-soft)]">This message was deleted</span>
          </p>
        ) : (
          <>
            {message.body.length > 0 && (
              <RichBody body={message.body} memberNames={memberNames ?? []} />
            )}
            {(message.attachments?.length ?? 0) > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {message.attachments!.map((a) =>
                  INLINE_IMAGE_MIME_TYPES.has(a.mimeType) ? (
                    <a
                      key={a.id}
                      href={`/api/files/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.fileName}
                        className="max-h-64 max-w-64 rounded-md border border-[var(--color-line)] object-cover"
                      />
                    </a>
                  ) : (
                    <a
                      key={a.id}
                      href={`/api/files/${a.id}`}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-xs text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                    >
                      <span>📄</span>
                      <span className="max-w-40 truncate">{a.fileName}</span>
                      <span className="text-[var(--color-ink-soft)]">{formatFileSize(a.size)}</span>
                    </a>
                  )
                )}
              </div>
            )}
            {message.linkPreview && <LinkPreviewCard preview={message.linkPreview} />}
          </>
        )}

        {actionError && <p className="mt-1 text-xs text-red-600">{actionError}</p>}

        {!isDeleted && (message.reactions?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions!.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction?.(message.id, r.emoji)}
                disabled={!onToggleReaction}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                  r.mine
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {onOpenThread && (message.replyCount ?? 0) > 0 && (
          <button
            onClick={() => onOpenThread(message.id)}
            className={`mt-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] ${
              showThreadUnread ? "font-semibold text-[var(--color-accent)]" : "font-medium text-[var(--color-accent)]"
            }`}
          >
            {showThreadUnread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
            )}
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            {message.lastReplyAt && (
              <span className="font-normal text-[var(--color-ink-soft)]">
                · Last reply {relativeTime(message.lastReplyAt)}
              </span>
            )}
          </button>
        )}
      </div>
    </li>
  );
}
