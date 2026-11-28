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
  // Sans-serif
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  "dm-sans": "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  "space-grotesk": "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  poppins: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  montserrat: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
  raleway: "'Raleway', ui-sans-serif, system-ui, sans-serif",
  "work-sans": "'Work Sans', ui-sans-serif, system-ui, sans-serif",
  nunito: "'Nunito', ui-sans-serif, system-ui, sans-serif",
  "josefin-sans": "'Josefin Sans', ui-sans-serif, system-ui, sans-serif",
  quicksand: "'Quicksand', ui-sans-serif, system-ui, sans-serif",
  outfit: "'Outfit', ui-sans-serif, system-ui, sans-serif",
  // Serif
  playfair: "'Playfair Display', ui-serif, Georgia, serif",
  lora: "'Lora', ui-serif, Georgia, serif",
  cormorant: "'Cormorant Garamond', ui-serif, Georgia, serif",
  merriweather: "'Merriweather', ui-serif, Georgia, serif",
  "eb-garamond": "'EB Garamond', ui-serif, Georgia, serif",
  "crimson-text": "'Crimson Text', ui-serif, Georgia, serif",
  "abril-fatface": "'Abril Fatface', ui-serif, Georgia, serif",
  // Script / display
  "dancing-script": "'Dancing Script', ui-serif, cursive",
  caveat: "'Caveat', ui-serif, cursive",
  pacifico: "'Pacifico', ui-serif, cursive",
  "great-vibes": "'Great Vibes', ui-serif, cursive",
  lobster: "'Lobster', ui-serif, cursive",
  "bebas-neue": "'Bebas Neue', ui-sans-serif, sans-serif",
};

// Weights requested from Google must be ones the family actually ships, or the
// css2 request errors for that family. ensureCardFonts tries 400/500/600 and
// swallows any that aren't there.
const GOOGLE_FAMILIES: Record<string, string> = {
  inter: "Inter:wght@400;500;600",
  "dm-sans": "DM+Sans:wght@400;500;700",
  "space-grotesk": "Space+Grotesk:wght@400;500;700",
  poppins: "Poppins:wght@400;500;600",
  montserrat: "Montserrat:wght@400;500;600",
  raleway: "Raleway:wght@400;500;600",
  "work-sans": "Work+Sans:wght@400;500;600",
  nunito: "Nunito:wght@400;500;600",
  "josefin-sans": "Josefin+Sans:wght@400;500;600",
  quicksand: "Quicksand:wght@400;500;600",
  outfit: "Outfit:wght@400;500;600",
  playfair: "Playfair+Display:wght@400;500;600",
  lora: "Lora:wght@400;500;600",
  cormorant: "Cormorant+Garamond:wght@400;500;600",
  merriweather: "Merriweather:wght@400;700",
  "eb-garamond": "EB+Garamond:wght@400;500;600",
  "crimson-text": "Crimson+Text:wght@400;600;700",
  "abril-fatface": "Abril+Fatface",
  "dancing-script": "Dancing+Script:wght@400;500;600;700",
  caveat: "Caveat:wght@400;500;600;700",
  pacifico: "Pacifico",
  "great-vibes": "Great+Vibes",
  lobster: "Lobster",
  "bebas-neue": "Bebas+Neue",
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
