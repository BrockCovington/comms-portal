"use client";

import { useEffect, useState } from "react";
import {
  COLOR_THEMES,
  DEFAULT_COLOR_MODE,
  DEFAULT_COLOR_THEME,
  applyColorMode,
  applyColorTheme,
  isColorMode,
  isColorTheme,
  type ColorMode,
  type ColorTheme,
} from "@/lib/themes";

const MODE_OPTIONS: { key: ColorMode; label: string; icon: string }[] = [
  { key: "light", label: "Light", icon: "☀︎" },
  { key: "dark", label: "Dark", icon: "☾" },
  { key: "system", label: "System", icon: "🖥" },
];

// Appearance settings — color mode (light/dark/system) + color scheme, mirrors
// the reference Preferences → Appearance section. Reads the live values off the
// <html> attributes the root layout set, and applies changes instantly.
export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const [theme, setTheme] = useState<ColorTheme>(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const el = document.documentElement;
    const m = el.getAttribute("data-color-mode");
    const t = el.getAttribute("data-theme");
    if (isColorMode(m)) setMode(m);
    if (isColorTheme(t)) setTheme(t);
  }, []);

  function chooseMode(m: ColorMode) {
    setMode(m);
    applyColorMode(m);
  }
  function chooseTheme(t: ColorTheme) {
    setTheme(t);
    applyColorTheme(t);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
          <h2 className="text-base font-semibold">Appearance</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {/* Color mode */}
          <h3 className="text-sm font-semibold">Color mode</h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Choose if the portal is light or dark, or follow your computer&apos;s settings.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => chooseMode(opt.key)}
                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition ${
                  mode === opt.key
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-line)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                <span aria-hidden>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Color scheme */}
          <h3 className="mt-6 text-sm font-semibold">Color scheme</h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Recolors the sidebar and accent throughout the portal.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLOR_THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => chooseTheme(t.key)}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition ${
                  theme === t.key
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-line)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                <span
                  className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: t.swatch }}
                />
                <span className="truncate">{t.name}</span>
                {theme === t.key && <span className="ml-auto text-[var(--color-accent)]">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
