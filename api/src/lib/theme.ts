import { z } from "zod";

// Themes are stored as jsonb (see db/schema.ts) so adding a design knob doesn't
// need a migration, but they are still validated on the way in — the values are
// interpolated into CSS custom properties on the public invitation page, and an
// unvalidated string there is a stylesheet injection.
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour like #1f2937");

// Font choices are an allowlist rather than free text for the same reason, and
// because each maps to a font actually bundled by the web app.
export const FONT_CHOICES = [
  "inter",
  "playfair",
  "lora",
  "dm-sans",
  "space-grotesk",
  "cormorant",
] as const;

export const LAYOUTS = ["classic", "poster", "minimal", "photo"] as const;

// Built-in cover artwork, drawn as SVG in the host's chosen palette rather than
// shipped as image files: a photograph would need a licence, a CDN and a
// per-template asset pipeline, where a pattern in the template's own colours
// costs nothing and can never clash with it. An event with no uploaded photo
// renders its template's artwork instead of a blank hero.
//
// An allowlist for the same reason the fonts are one — the name selects a
// component in web/src/lib/coverArt.tsx, and anything outside this list would
// render nothing.
export const COVER_ART = [
  "plain",
  "marigold",
  "diyas",
  "mandala",
  "rings",
  "petals",
  "stars",
  "confetti",
  "balloons",
  "home",
  "palms",
  "stripes",
] as const;

export const paletteSchema = z.object({
  bg: hexColor,
  surface: hexColor,
  text: hexColor,
  muted: hexColor,
  accent: hexColor,
  accentText: hexColor,
});

export const themeSchema = z.object({
  palette: paletteSchema,
  fonts: z.object({
    heading: z.enum(FONT_CHOICES),
    body: z.enum(FONT_CHOICES),
  }),
  layout: z.enum(LAYOUTS),
  // Optional so every template written before artwork existed still parses —
  // themes are jsonb rows, not code, and a required key here would make the
  // whole stored theme invalid and silently fall back to DEFAULT_THEME.
  art: z.enum(COVER_ART).optional(),
});

// Every key optional — an event stores only what it changes from its template.
export const themeOverridesSchema = z
  .object({
    palette: paletteSchema.partial(),
    fonts: z.object({ heading: z.enum(FONT_CHOICES), body: z.enum(FONT_CHOICES) }).partial(),
    layout: z.enum(LAYOUTS),
    art: z.enum(COVER_ART),
  })
  .partial();

export type Theme = z.infer<typeof themeSchema>;
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;

export const DEFAULT_THEME: Theme = {
  palette: {
    bg: "#faf7f2",
    surface: "#ffffff",
    text: "#1f2937",
    muted: "#6b7280",
    accent: "#b45309",
    accentText: "#ffffff",
  },
  fonts: { heading: "playfair", body: "inter" },
  layout: "classic",
  art: "plain",
};

// Resolved once on the server and sent to the client already merged, so the
// public page never has to know about templates or fall back mid-render.
export function resolveTheme(templateTheme: unknown, overrides: unknown): Theme {
  const base = themeSchema.safeParse(templateTheme);
  const resolvedBase = base.success ? base.data : DEFAULT_THEME;

  const parsed = themeOverridesSchema.safeParse(overrides ?? {});
  const o = parsed.success ? parsed.data : {};

  return {
    palette: { ...resolvedBase.palette, ...(o.palette ?? {}) },
    fonts: { ...resolvedBase.fonts, ...(o.fonts ?? {}) },
    layout: o.layout ?? resolvedBase.layout,
    // Event override, then the template's own artwork, then nothing decorative.
    art: o.art ?? resolvedBase.art ?? "plain",
  };
}
