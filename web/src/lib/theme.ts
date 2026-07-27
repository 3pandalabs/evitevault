import type { PublicEvent } from "./api/public";

// Google Fonts families, keyed by the allowlist the API validates against
// (api/src/lib/theme.ts). The allowlist is what makes it safe to interpolate
// these into a stylesheet — an arbitrary font name from a host would be a CSS
// injection on a page every guest loads.
const FONT_STACKS: Record<string, string> = {
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  playfair: "'Playfair Display', ui-serif, Georgia, serif",
  lora: "'Lora', ui-serif, Georgia, serif",
  "dm-sans": "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  "space-grotesk": "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  cormorant: "'Cormorant Garamond', ui-serif, Georgia, serif",
};

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
    "--ev-font-heading": FONT_STACKS[theme.fonts.heading] ?? FONT_STACKS.inter,
    "--ev-font-body": FONT_STACKS[theme.fonts.body] ?? FONT_STACKS.inter,
  } as React.CSSProperties;
}

export function googleFontsHref(theme: PublicEvent["theme"]): string {
  const families: Record<string, string> = {
    inter: "Inter:wght@400;500;600",
    playfair: "Playfair+Display:wght@400;500;600",
    lora: "Lora:wght@400;500;600",
    "dm-sans": "DM+Sans:wght@400;500;700",
    "space-grotesk": "Space+Grotesk:wght@400;500;700",
    cormorant: "Cormorant+Garamond:wght@400;500;600",
  };
  const wanted = new Set([theme.fonts.heading, theme.fonts.body]);
  const params = [...wanted]
    .map((f) => `family=${families[f] ?? families.inter}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
