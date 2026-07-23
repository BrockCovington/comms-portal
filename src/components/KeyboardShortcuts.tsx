"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["⌘", "K"], desc: "Quick switcher — jump to a channel or person" },
  { keys: ["⌘", "⇧", "K"], desc: "Start a new direct message" },
  { keys: ["↑"], desc: "Edit your last message (in an empty composer)" },
  { keys: ["⌘", "/"], desc: "Show this shortcuts list" },
  { keys: ["Esc"], desc: "Close a menu, dialog, or panel" },
];

// Global keyboard shortcuts + a ⌘/ help overlay. Mounted once in the app layout.
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // ⌘⇧K → new DM (⌘K without shift is the quick switcher).
      if (mod && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        router.push("/dms/new");
        return;
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-center px-4 pt-[15vh]" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-2xl">
        <p className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Keyboard shortcuts</p>
        <ul className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-4">
              <span className="text-sm text-[var(--color-ink-soft)]">{s.desc}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-0.5 font-sans text-xs text-[var(--color-ink)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
