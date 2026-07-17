"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { EmojiToken } from "@/components/EmojiToken";
import { StatusModal, type UserStatus } from "@/components/StatusModal";

// Profile popover opened from the icon rail's avatar. Upload / replace /
// remove your own profile picture. Anchored to the right of the rail, same
// fixed-positioning trick as NotificationPrefsPanel (the rail is an
// overflow-y-auto column that would otherwise clip an absolute popover).
export function ProfilePanel({
  name,
  email,
  image,
  onClose,
}: {
  name: string;
  email: string;
  image: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Local mirror so the picture updates instantly here; router.refresh()
  // propagates it to the rail/top bar (which read it from the session).
  const [preview, setPreview] = useState<string | null>(image);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UserStatus>({ emoji: null, text: null, expiresAt: null });
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStatus(d); })
      .catch(() => {});
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/users/avatar", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't upload picture");
        return;
      }
      setPreview(data.image);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't remove picture");
        return;
      }
      setPreview(data.image ?? null);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-4 left-[5.5rem] z-50 w-64 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-[var(--color-ink)] shadow-lg">
        <div className="flex flex-col items-center text-center">
          <Avatar name={name} image={preview} size={72} variant="solid" />
          <p className="mt-2 text-sm font-semibold">
            {name}
            {status.emoji && (
              <span className="ml-1.5" title={status.text ?? undefined}>
                <EmojiToken token={status.emoji} imgClassName="inline-block h-4 w-4 object-contain align-text-bottom" />
              </span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-ink-soft)]">{email}</p>
        </div>

        {/* Status — Slack-style "Update your status" affordance. */}
        <button
          onClick={() => setStatusModalOpen(true)}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
        >
          {status.emoji ? (
            <EmojiToken token={status.emoji} imgClassName="inline-block h-4 w-4 object-contain" />
          ) : (
            <span className="text-[var(--color-ink-soft)]">☺</span>
          )}
          <span className={`min-w-0 flex-1 truncate ${status.text ? "" : "text-[var(--color-ink-soft)]"}`}>
            {status.text ?? "Update your status"}
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />

        <div className="mt-4 space-y-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working…" : preview ? "Change photo" : "Upload photo"}
          </button>
          {preview && (
            <button
              onClick={remove}
              disabled={busy}
              className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
        <p className="mt-2 text-center text-[10px] text-[var(--color-ink-soft)]">
          PNG, JPEG, WebP, or GIF · max 2MB
        </p>
      </div>

      {statusModalOpen && (
        <StatusModal
          initial={status}
          onClose={() => setStatusModalOpen(false)}
          onSaved={(s) => {
            setStatus(s);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
