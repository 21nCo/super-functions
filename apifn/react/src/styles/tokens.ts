/**
 * Design tokens — CSS variable names and helper to inject theme styles.
 * Supports light, dark, and auto (prefers-color-scheme) themes.
 */

export const CSS_VARS = {
    bg: "--apifn-bg",
    bgSurface: "--apifn-bg-surface",
    bgSurfaceHover: "--apifn-bg-surface-hover",
    border: "--apifn-border",
    text: "--apifn-text",
    textMuted: "--apifn-text-muted",
    accent: "--apifn-accent",
    accentText: "--apifn-accent-text",
    green: "--apifn-green",
    blue: "--apifn-blue",
    yellow: "--apifn-yellow",
    red: "--apifn-red",
    purple: "--apifn-purple",
    orange: "--apifn-orange",
    radius: "--apifn-radius",
    fontMono: "--apifn-font-mono",
    fontSans: "--apifn-font-sans",
} as const;

const DARK_THEME = `
  --apifn-bg: #0f1117;
  --apifn-bg-surface: #1a1d2e;
  --apifn-bg-surface-hover: #252840;
  --apifn-border: #2d3748;
  --apifn-text: #e2e8f0;
  --apifn-text-muted: #64748b;
  --apifn-accent: #7c3aed;
  --apifn-accent-text: #c4b5fd;
  --apifn-green: #6ee7b7;
  --apifn-blue: #93c5fd;
  --apifn-yellow: #fcd34d;
  --apifn-red: #fca5a5;
  --apifn-purple: #c4b5fd;
  --apifn-orange: #fdba74;
  --apifn-radius: 6px;
  --apifn-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --apifn-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;

const LIGHT_THEME = `
  --apifn-bg: #ffffff;
  --apifn-bg-surface: #f8fafc;
  --apifn-bg-surface-hover: #f1f5f9;
  --apifn-border: #e2e8f0;
  --apifn-text: #0f172a;
  --apifn-text-muted: #64748b;
  --apifn-accent: #7c3aed;
  --apifn-accent-text: #6d28d9;
  --apifn-green: #059669;
  --apifn-blue: #2563eb;
  --apifn-yellow: #d97706;
  --apifn-red: #dc2626;
  --apifn-purple: #7c3aed;
  --apifn-orange: #ea580c;
  --apifn-radius: 6px;
  --apifn-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --apifn-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;

export function getThemeStyle(theme: "light" | "dark" | "auto"): string {
    if (theme === "light") return `.apifn-root { ${LIGHT_THEME} }`;
    if (theme === "dark") return `.apifn-root { ${DARK_THEME} }`;
    return `
    .apifn-root { ${LIGHT_THEME} }
    @media (prefers-color-scheme: dark) { .apifn-root { ${DARK_THEME} } }
  `;
}

/** Method badge colors */
export const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" },
    post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" },
    patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
    head: { bg: "#1f2937", text: "#9ca3af" },
    options: { bg: "#1f2937", text: "#9ca3af" },
};
