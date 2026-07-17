// Shared appearance constants — used by the root layout (to apply the saved
// preference server-side) and the Appearance settings panel (to change it).

export const COLOR_MODE_COOKIE = "pref-color-mode";
export const COLOR_THEME_COOKIE = "pref-color-theme";

export const COLOR_MODES = ["light", "dark", "system"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

// The 5 selectable color schemes. `swatch` is the accent shown in the picker;
// the actual colors live in globals.css under :root[data-theme="<key>"].
export const COLOR_THEMES = [
  { key: "syndica", name: "Syndica", swatch: "#3675f8" },
  { key: "aubergine", name: "Aubergine", swatch: "#b552cc" },
  { key: "forest", name: "Forest", swatch: "#16a06b" },
  { key: "ember", name: "Ember", swatch: "#e8632a" },
  { key: "rose", name: "Rose", swatch: "#e23e6b" },
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number]["key"];

export const DEFAULT_COLOR_MODE: ColorMode = "light";
export const DEFAULT_COLOR_THEME: ColorTheme = "syndica";

export function isColorMode(v: unknown): v is ColorMode {
  return typeof v === "string" && (COLOR_MODES as readonly string[]).includes(v);
}

export function isColorTheme(v: unknown): v is ColorTheme {
  return typeof v === "string" && COLOR_THEMES.some((t) => t.key === v);
}

const ONE_YEAR = 60 * 60 * 24 * 365;

// Apply a preference immediately (live, no reload) and persist it in the
// cookie the root layout reads on the next SSR. Client-only.
export function applyColorMode(mode: ColorMode) {
  document.documentElement.setAttribute("data-color-mode", mode);
  document.cookie = `${COLOR_MODE_COOKIE}=${mode}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function applyColorTheme(theme: ColorTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.cookie = `${COLOR_THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
