import type { Theme } from "../types/chemistry";

/**
 * Per-theme metadata that TypeScript needs but CSS can't provide.
 *
 * A theme's actual colors live in styles/theme.css as `[data-theme="..."]`
 * custom properties, so nothing at runtime has to read this file to render
 * the app — switching themes is one attribute write on <html> (App.tsx).
 * What's here is the handful of things CSS can't answer:
 *
 *  - the swatch colors the ThemePicker draws as its preview chips,
 *  - which themes are in the dark camp (see isDarkTheme),
 *  - the 3D viewer's WebGL clear color, which has to be a literal string,
 *  - the cycle order for toggleTheme.
 *
 * Kept out of both the store and the ThemePicker component so those two can
 * import it without importing each other.
 */
export interface ThemeInfo {
  id: Theme;
  /** Translation key for the theme's display name (e.g. "theme.oled"). */
  labelKey: string;
  /** Translation key for the one-line design description. */
  descriptionKey: string;
  /** Canvas background — doubles as the theme's "Match app theme" export fill. */
  canvas: string;
  /** Sidebar/panel tone, shown as the swatch's middle band. */
  panel: string;
  /** Accent color, shown as the swatch's phosphor dot. */
  accent: string;
  /** Whether this theme is a dark one (see isDarkTheme). */
  dark: boolean;
}

/** Presentation order for the picker and for toggleTheme's cycle. */
export const THEMES: readonly ThemeInfo[] = [
  {
    id: "light",
    labelKey: "theme.light",
    descriptionKey: "theme.lightDesc",
    canvas: "#fbfbfc",
    panel: "#ffffff",
    accent: "#2f5d8a",
    dark: false,
  },
  {
    id: "dark",
    labelKey: "theme.dark",
    descriptionKey: "theme.darkDesc",
    canvas: "#17191e",
    panel: "#1b1e24",
    accent: "#6fa3d8",
    dark: true,
  },
  {
    id: "chemdraw",
    labelKey: "theme.chemdraw",
    descriptionKey: "theme.chemdrawDesc",
    canvas: "#ffffff",
    panel: "#f0eee9",
    accent: "#000080",
    dark: false,
  },
  {
    id: "slate",
    labelKey: "theme.slate",
    descriptionKey: "theme.slateDesc",
    canvas: "#0d1527",
    panel: "#131d31",
    accent: "#38bdf8",
    dark: true,
  },
  {
    id: "oled",
    labelKey: "theme.oled",
    descriptionKey: "theme.oledDesc",
    canvas: "#000000",
    panel: "#0a0a0a",
    accent: "#00e5ff",
    dark: true,
  },
] as const;

/** Just the ids, for validating a persisted value. */
export const THEME_IDS: readonly Theme[] = THEMES.map((t) => t.id);

/**
 * Whether a theme is one of the dark ones. The single source of truth for
 * the places that can't read a CSS variable and would otherwise each
 * re-derive "is this dark?" from the value — which is exactly the kind of
 * check that silently misses a newly added dark theme.
 */
export function isDarkTheme(theme: Theme): boolean {
  return THEMES.find((t) => t.id === theme)?.dark ?? false;
}

function themeInfo(theme: Theme): ThemeInfo {
  return THEMES.find((t) => t.id === theme) ?? THEMES[0];
}

/**
 * Background color for the 3D viewer. 3Dmol.js paints this itself rather
 * than via CSS, so it needs a literal value per theme; the dark themes get
 * their own panel tone so the WebGL canvas doesn't glare against a dark UI.
 */
export function themeViewerBackground(theme: Theme): string {
  const info = themeInfo(theme);
  return info.dark ? info.panel : info.canvas;
}

/** Next theme in presentation order, wrapping around — the cycle a
 *  sequential toggle would step through. */
export function nextTheme(theme: Theme): Theme {
  const i = THEME_IDS.indexOf(theme);
  return THEME_IDS[(i + 1) % THEME_IDS.length];
}
