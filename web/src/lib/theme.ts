import type { PublicEvent } from "./api/public";
import { fontStack, googleFontsHrefFor } from "./fontStacks";

// The theme becomes CSS custom properties on a wrapper element rather than
// Tailwind classes: the values are per-event data, so there is no class name to
// generate at build time. Everything here has already been validated
// server-side against a hex/enum schema.
export function themeStyle(theme: PublicEvent["theme"]): React.CSSProperties {
  return {
    "--ev-bg": theme.palette.bg,
    "--ev-surface": theme.palette.surface,
    "--ev-text": theme.palette.text,
    "--ev-muted": theme.palette.muted,
    "--ev-accent": theme.palette.accent,
    "--ev-accent-text": theme.palette.accentText,
    "--ev-font-heading": fontStack(theme.fonts.heading),
    "--ev-font-body": fontStack(theme.fonts.body),
  } as React.CSSProperties;
}

export function googleFontsHref(theme: PublicEvent["theme"]): string {
  return googleFontsHrefFor([theme.fonts.heading, theme.fonts.body]);
}
