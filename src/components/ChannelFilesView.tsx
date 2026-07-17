"use client";

import { useEffect, useState } from "react";

type FileItem = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedByName: string | null;
};
type LinkItem = {
  messageId: string;
  url: string;
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
  createdAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// The "Files & links" tab body: everything shared in this channel — uploaded
// files and unfurled links — fetched from GET /api/channels/:id/files.
export function ChannelFilesView({
  channelId,
  onOpenMessage,
}: {
  channelId: string;
  onOpenMessage: (messageId: string) => void;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/channels/${channelId}/files`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { files: [], links: [] }))
      .then((d) => {
        if (cancelled) return;
        setFiles(d.files ?? []);
        setLinks(d.links ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {loading ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : files.length === 0 && links.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Nothing shared in this conversation yet.</p>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          {files.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Files ({files.length})
              </h3>
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-md border border-[var(--color-line)] px-3 py-2 hover:bg-[var(--color-accent-soft)]"
                    >
                      <span className="text-lg">📄</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                          {f.fileName}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-ink-soft)]">
                          {formatSize(f.size)} · {f.uploadedByName ?? "Someone"} · {fmtDate(f.createdAt)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {links.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Links ({links.length})
              </h3>
              <ul className="space-y-1.5">
                {links.map((l, i) => (
                  <li key={`${l.messageId}-${i}`}>
                    <div className="flex items-center gap-3 rounded-md border border-[var(--color-line)] px-3 py-2 hover:bg-[var(--color-accent-soft)]">
                      {l.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="text-lg">🔗</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm font-medium text-[var(--color-pink,var(--color-accent))] hover:underline"
                        >
                          {l.title || l.url}
                        </a>
                        <span className="block truncate text-xs text-[var(--color-ink-soft)]">
                          {l.siteName ? `${l.siteName} · ` : ""}{fmtDate(l.createdAt)}
                        </span>
                      </span>
                      <button
                        onClick={() => onOpenMessage(l.messageId)}
                        className="shrink-0 rounded px-2 py-1 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
                        title="Jump to message"
                      >
                        Jump
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
