// The font allowlist, shared by the guest invitation (lib/theme.ts) and the
// host's template picker. It lives in its own module because lib/theme.ts is
// server-only by association — it types against the public API client — while
// the picker is a client component, and the two must not drift: a stack here
// that the API doesn't know about renders one thing in the picker and another
// on the invitation the guest actually opens.
//
// The keys are exactly the allowlist the API validates against
// (api/src/lib/theme.ts). That allowlist is what makes it safe to interpolate
// these into a stylesheet — an arbitrary font name from a host would be a CSS
// injection on a page every guest loads.
export const FONT_STACKS: Record<string, string> = {
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  playfair: "'Playfair Display', ui-serif, Georgia, serif",
  lora: "'Lora', ui-serif, Georgia, serif",
  "dm-sans": "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  "space-grotesk": "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  cormorant: "'Cormorant Garamond', ui-serif, Georgia, serif",
};

const GOOGLE_FAMILIES: Record<string, string> = {
  inter: "Inter:wght@400;500;600",
  playfair: "Playfair+Display:wght@400;500;600",
  lora: "Lora:wght@400;500;600",
  "dm-sans": "DM+Sans:wght@400;500;700",
  "space-grotesk": "Space+Grotesk:wght@400;500;700",
  cormorant: "Cormorant+Garamond:wght@400;500;600",
};

export function fontStack(name: string): string {
  return FONT_STACKS[name] ?? FONT_STACKS.inter;
}

/** A Google Fonts stylesheet URL for exactly the families asked for. */
export function googleFontsHrefFor(families: Iterable<string>): string {
  const params = [...new Set(families)]
    .map((f) => `family=${GOOGLE_FAMILIES[f] ?? GOOGLE_FAMILIES.inter}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** Every family, for the picker — which shows all the designs at once. */
export const ALL_FONTS = Object.keys(GOOGLE_FAMILIES);
