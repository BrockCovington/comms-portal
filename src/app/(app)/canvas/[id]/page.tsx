"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { renderRichText, type RichSegment } from "@/lib/richtext";
import { useCustomEmoji } from "@/components/CustomEmojiContext";
import { MenuIcon, PencilIcon, TrashIcon } from "@/components/RailIcons";
import { useMobileNav } from "@/components/MobileNavContext";

type CanvasData = {
  id: string;
  title: string;
  body: string;
  createdByName: string | null;
  updatedAt: string;
  canEdit: boolean;
};

function renderSegments(segments: RichSegment[]) {
  return segments.map((seg, i) => {
    switch (seg.kind) {
      case "mention":
        return <span key={i} className="rounded bg-[var(--color-accent-soft)] px-1 font-medium text-[var(--color-accent)]">{seg.text}</span>;
      case "bold":
        return <strong key={i}>{seg.text}</strong>;
      case "italic":
        return <em key={i}>{seg.text}</em>;
      case "code":
        return <code key={i} className="rounded bg-[var(--color-accent-soft)] px-1 py-0.5 text-[0.85em]">{seg.text}</code>;
      case "customEmoji":
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} src={seg.url} alt={seg.text} title={seg.text} className="inline-block h-[1.25em] w-[1.25em] object-contain align-text-bottom" />;
      default:
        return <span key={i}>{seg.text}</span>;
    }
  });
}

// Renders the canvas body with the same lightweight rich text as messages
// (**bold**, *italic*, `code`, - bullets, :emoji:).
function CanvasBody({ body }: { body: string }) {
  const { byName } = useCustomEmoji();
  if (!body.trim()) {
    return <p className="text-sm italic text-[var(--color-ink-soft)]">This canvas is empty.</p>;
  }
  const blocks = renderRichText(body, [], byName);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--color-ink)]">
      {blocks.map((block, i) =>
        block.type === "bullet" ? (
          <ul key={i} className="ml-5 list-disc space-y-1">
            {block.items.map((item, j) => (
              <li key={j}>{renderSegments(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">
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

export default function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setOpen } = useMobileNav();
  const [canvas, setCanvas] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/canvas/${id}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d: CanvasData | null) => {
        if (d) {
          setCanvas(d);
          setTitle(d.title);
          setBody(d.body);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/canvas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled canvas", body }),
      });
      if (res.ok) {
        setCanvas((c) => (c ? { ...c, title: title.trim() || "Untitled canvas", body } : c));
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this canvas? This can't be undone.")) return;
    const res = await fetch(`/api/canvas/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/canvas");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Link href="/canvas" className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]">
          Canvases
        </Link>
        <span className="text-[var(--color-ink-soft)]">/</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">
          {canvas?.title ?? "…"}
        </span>
        {canvas?.canEdit && !editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
            >
              <PencilIcon className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={remove}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
          ) : notFound || !canvas ? (
            <p className="text-sm text-[var(--color-ink-soft)]">This canvas doesn&apos;t exist.</p>
          ) : editing ? (
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Canvas title"
                className="w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-lg font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write anything… **bold**, *italic*, `code`, - bullets, :emoji:"
                rows={18}
                className="w-full resize-y rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setEditing(false); setTitle(canvas.title); setBody(canvas.body); }}
                  className="rounded-md border border-[var(--color-line)] px-4 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-2xl font-bold text-[var(--color-ink)]">{canvas.title}</h1>
              <p className="mb-5 text-xs text-[var(--color-ink-soft)]">
                By {canvas.createdByName ?? "Someone"} · edited{" "}
                {new Date(canvas.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <CanvasBody body={canvas.body} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
