"use client";

import Link from "next/link";
import type { FileSummary } from "@/lib/files";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Replaces the normal channel sidebar while on /files. The filename opens
// the file directly (same /api/files/:id route the old full-page list
// used, access-checked there — no change needed); the channel name jumps
// to that channel for context instead.
export function FilesListColumn({
  files,
  onNavigate,
}: {
  files: FileSummary[];
  onNavigate: () => void;
}) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <h2 className="mb-2 px-2 text-sm font-semibold text-[var(--color-on-sidebar)]">Files</h2>
      <ul className="space-y-0.5">
        {files.map((f) => (
          <li key={f.id}>
            <div className="flex items-start gap-2 rounded-md px-2 py-2 text-[var(--color-on-sidebar)] hover:bg-white/10">
              <span className="mt-0.5 shrink-0">📄</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/files/${f.id}`}
                  className="block truncate text-xs font-medium hover:underline"
                >
                  {f.fileName}
                </a>
                <p className="mt-0.5 truncate text-[10px] text-[var(--color-on-sidebar-dim)]">
                  {formatFileSize(f.size)} ·{" "}
                  <Link href={`/c/${f.channelId}`} onClick={onNavigate} className="hover:underline">
                    {f.isDm ? "" : "#"}
                    {f.channelName}
                  </Link>
                </p>
              </div>
            </div>
          </li>
        ))}
        {files.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--color-on-sidebar-dim)]">No files yet</li>
        )}
      </ul>
    </nav>
  );
}
