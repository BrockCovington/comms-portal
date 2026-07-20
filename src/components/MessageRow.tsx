"use client";

import { useState } from "react";
import type { ChatMessage, LinkPreview } from "@/hooks/useMessages";
import { renderRichText, type RichSegment } from "@/lib/richtext";
import { FullEmojiPicker } from "@/components/FullEmojiPicker";
import { EditHistory } from "@/components/EditHistory";
import { ForwardDialog } from "@/components/ForwardDialog";
import { useCustomEmoji } from "@/components/CustomEmojiContext";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ThreadIcon,
  ForwardIcon,
  ReactionIcon,
  LaterIcon,
  KebabIcon,
  PinIcon,
  PencilIcon,
  LinkIcon,
  CopyIcon,
  TrashIcon,
  ClockIcon,
} from "@/components/RailIcons";

// The quick one-click reactions in the hover toolbar (Slack-style).
const QUICK_REACTIONS = ["👍", "🙏", "🎉"];

// "Alice", "Alice and Bob", "Alice, Bob and Carol", "Alice, Bob, Carol, Dan,
// Eve and 3 others" — the who-reacted tooltip text.
function formatReactors(names: string[]): string {
  const MAX = 5;
  if (names.length === 1) return names[0];
  if (names.length <= MAX) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const extra = names.length - MAX;
  return `${names.slice(0, MAX).join(", ")} and ${extra} ${extra === 1 ? "other" : "others"}`;
}

// The embedded original shown on a forwarded message.
function ForwardedEmbed({ forwarded }: { forwarded: NonNullable<ChatMessage["forwarded"]> }) {
  return (
    <div className="mt-1.5 max-w-lg rounded-r-md border-l-4 border-[var(--color-line)] bg-[var(--color-accent-soft)]/20 py-1 pl-3 pr-2">
      <p className="text-xs text-[var(--color-ink-soft)]">
        ↪ Forwarded from {forwarded.sourceIsDm ? forwarded.sourceLabel : `#${forwarded.sourceLabel}`}
        {forwarded.sourceAuthorName ? ` · ${forwarded.sourceAuthorName}` : ""}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--color-ink)]">
        {forwarded.body || <span className="italic text-[var(--color-ink-soft)]">(no text)</span>}
      </p>
    </div>
  );
}

// A reaction token is either a ":name:" custom emoji or a unicode grapheme.
function ReactionToken({ token }: { token: string }) {
  const { byName } = useCustomEmoji();
  const custom = token.startsWith(":") && token.endsWith(":") ? byName.get(token.slice(1, -1)) : undefined;
  if (custom) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={custom} alt={token} className="inline-block h-4 w-4 object-contain align-text-bottom" />;
  }
  return <span>{token}</span>;
}

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
          className="block truncate text-sm font-medium text-[var(--color-pink,var(--color-accent))] hover:underline"
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
      case "customEmoji":
        // eslint-disable-next-line @next/next/no-img-element
        return (
          <img
            key={i}
            src={seg.url}
            alt={seg.text}
            title={seg.text}
            className="inline-block h-[1.25em] w-[1.25em] object-contain align-text-bottom"
          />
        );
      default:
        return <span key={i}>{seg.text}</span>;
    }
  });
}

function RichBody({ body, memberNames }: { body: string; memberNames: string[] }) {
  const { byName } = useCustomEmoji();
  const blocks = renderRichText(body, memberNames, byName);
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
  channelId,
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
  channelId: string;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindNote, setRemindNote] = useState<string | null>(null);

  function closeMore() {
    setMoreOpen(false);
    setRemindOpen(false);
  }

  async function setReminder(deltaMs: number, label: string) {
    closeMore();
    setActionError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, remindAt: new Date(Date.now() + deltaMs).toISOString() }),
      });
      if (res.ok) {
        setRemindNote(`⏰ Reminder set ${label}`);
        setTimeout(() => setRemindNote(null), 4000);
      } else {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? "Couldn't set reminder");
      }
    } catch {
      setActionError("Couldn't set reminder");
    }
  }

  // Milliseconds from now to the next local 9:00 AM (tomorrow).
  function untilTomorrow9(): number {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime() - Date.now();
  }

  function copyLink() {
    navigator.clipboard
      ?.writeText(`${window.location.origin}/c/${channelId}?message=${message.id}`)
      .catch(() => {});
    setMoreOpen(false);
  }
  function copyText() {
    navigator.clipboard?.writeText(message.body).catch(() => {});
    setMoreOpen(false);
  }

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
      className={`group relative flex gap-3 rounded-md px-2 py-1 -mx-2 transition-colors duration-1000 ${
        isHighlighted
          ? "bg-yellow-100"
          : isActiveThread
            ? "bg-[var(--color-accent-soft)]"
            : ""
      } ${rowOpensThread ? "cursor-pointer" : ""}`}
    >
      <Avatar name={message.user.name} image={message.user.image} size={36} shape="square" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--color-ink)]">
            {isMine ? "You" : message.user.name ?? "Unknown"}
          </span>
          <StatusBadge
            emoji={message.user.statusEmoji}
            text={message.user.statusText}
            expiresAt={message.user.statusExpiresAt}
          />
          <time className="text-xs text-[var(--color-pink,var(--color-ink-soft))]">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {message.editedAt && !isDeleted && (
            <span className="relative">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                title="View edit history"
                className="text-xs text-[var(--color-ink-soft)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-accent)]"
              >
                (edited)
              </button>
              {historyOpen && (
                <EditHistory
                  channelId={channelId}
                  messageId={message.id}
                  onClose={() => setHistoryOpen(false)}
                />
              )}
            </span>
          )}
          {message.isPinned && !isDeleted && (
            <span aria-label="Pinned to channel" title="Pinned to channel" className="text-[var(--color-accent)]">
              <PinIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {message.savedByMe && !isDeleted && (
            <span aria-label="Saved for later" title="Saved for later" className="text-[var(--color-accent)]">
              <LaterIcon className="h-3.5 w-3.5" />
            </span>
          )}
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
            {message.forwarded && <ForwardedEmbed forwarded={message.forwarded} />}
          </>
        )}

        {actionError && <p className="mt-1 text-xs text-red-600">{actionError}</p>}
        {remindNote && <p className="mt-1 text-xs text-[var(--color-accent)]">{remindNote}</p>}

        {!isDeleted && (message.reactions?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions!.map((r) => (
              <div key={r.emoji} className="group/rx relative">
                <button
                  onClick={() => onToggleReaction?.(message.id, r.emoji)}
                  disabled={!onToggleReaction}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                    r.mine
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
                  }`}
                >
                  <ReactionToken token={r.emoji} />
                  <span>{r.count}</span>
                </button>
                {(r.names?.length ?? 0) > 0 && (
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-max max-w-[240px] rounded-md bg-[var(--color-ink)] px-2 py-1 text-left text-[11px] leading-snug text-[var(--color-canvas)] shadow-lg group-hover/rx:block">
                    <span className="font-medium">{formatReactors(r.names)}</span>
                    <span className="opacity-80"> reacted</span>
                  </div>
                )}
              </div>
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
      {!isDeleted && !editing && (
        <div
          className={`absolute -top-3 right-3 z-10 items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5 shadow-sm ${
            moreOpen || pickerOpen ? "flex" : "hidden group-hover:flex"
          }`}
        >
          {onToggleReaction && (
            <>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(message.id, emoji)}
                  title={`React ${emoji}`}
                  className="flex h-7 w-7 items-center justify-center rounded text-base leading-none hover:bg-[var(--color-accent-soft)]"
                >
                  {emoji}
                </button>
              ))}
              <div className="relative">
                <ToolbarButton onClick={() => setPickerOpen((v) => !v)} label="Find another reaction">
                  <ReactionIcon className="h-[18px] w-[18px]" />
                </ToolbarButton>
                {pickerOpen && (
                  <FullEmojiPicker
                    onPick={(token) => onToggleReaction(message.id, token)}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
            </>
          )}
          {onOpenThread && (
            <ToolbarButton onClick={() => onOpenThread(message.id)} label="Reply in thread">
              <ThreadIcon className="h-[18px] w-[18px]" />
            </ToolbarButton>
          )}
          <ToolbarButton onClick={() => setForwardOpen(true)} label="Forward message">
            <ForwardIcon className="h-[18px] w-[18px]" />
          </ToolbarButton>
          {onToggleSave && (
            <ToolbarButton
              onClick={() => onToggleSave(message.id)}
              label={message.savedByMe ? "Remove from later" : "Save for later"}
              active={message.savedByMe}
            >
              <LaterIcon className="h-[18px] w-[18px]" />
            </ToolbarButton>
          )}
          <div className="relative">
            <ToolbarButton onClick={() => setMoreOpen((v) => !v)} label="More actions" active={moreOpen}>
              <KebabIcon className="h-[18px] w-[18px]" />
            </ToolbarButton>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMore} />
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-left shadow-lg">
                  {remindOpen ? (
                    <>
                      <button
                        onClick={() => setRemindOpen(false)}
                        className="mb-0.5 flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
                      >
                        ‹ Remind me about this
                      </button>
                      <MenuItem onClick={() => setReminder(20 * 60_000, "in 20 minutes")} icon={<ClockIcon className="h-4 w-4" />}>
                        In 20 minutes
                      </MenuItem>
                      <MenuItem onClick={() => setReminder(60 * 60_000, "in 1 hour")} icon={<ClockIcon className="h-4 w-4" />}>
                        In 1 hour
                      </MenuItem>
                      <MenuItem onClick={() => setReminder(3 * 60 * 60_000, "in 3 hours")} icon={<ClockIcon className="h-4 w-4" />}>
                        In 3 hours
                      </MenuItem>
                      <MenuItem onClick={() => setReminder(untilTomorrow9(), "for tomorrow at 9:00 AM")} icon={<ClockIcon className="h-4 w-4" />}>
                        Tomorrow
                      </MenuItem>
                    </>
                  ) : (
                    <>
                      {isMine && onEdit && (
                        <MenuItem onClick={() => { closeMore(); startEdit(); }} icon={<PencilIcon className="h-4 w-4" />}>
                          Edit message
                        </MenuItem>
                      )}
                      {onTogglePin && (
                        <MenuItem onClick={() => { closeMore(); onTogglePin(message.id); }} icon={<PinIcon className="h-4 w-4" />}>
                          {message.isPinned ? "Unpin from channel" : "Pin to channel"}
                        </MenuItem>
                      )}
                      {onToggleSave && (
                        <MenuItem onClick={() => { closeMore(); onToggleSave(message.id); }} icon={<LaterIcon className="h-4 w-4" />}>
                          {message.savedByMe ? "Remove from later" : "Save for later"}
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => setRemindOpen(true)} icon={<ClockIcon className="h-4 w-4" />}>
                        Remind me about this
                      </MenuItem>
                      <MenuItem onClick={copyLink} icon={<LinkIcon className="h-4 w-4" />}>
                        Copy link
                      </MenuItem>
                      <MenuItem onClick={copyText} icon={<CopyIcon className="h-4 w-4" />}>
                        Copy message
                      </MenuItem>
                      {isMine && onDelete && (
                        <MenuItem onClick={() => { closeMore(); handleDelete(); }} icon={<TrashIcon className="h-4 w-4" />} danger>
                          Delete message…
                        </MenuItem>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {forwardOpen && (
        <ForwardDialog
          sourceChannelId={channelId}
          messageId={message.id}
          onClose={() => setForwardOpen(false)}
        />
      )}
    </li>
  );
}

function ToolbarButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--color-accent-soft)] ${
        active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--color-accent-soft)] ${
        danger ? "text-red-600 hover:bg-red-50" : "text-[var(--color-ink)]"
      }`}
    >
      <span className={`shrink-0 ${danger ? "" : "text-[var(--color-ink-soft)]"}`}>{icon}</span>
      {children}
    </button>
  );
}
