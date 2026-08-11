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

// ---------------------------------------------------------------------------
// The shareable card.
//
// A card is a *rendering* of the event, not a second copy of it: the title,
// date, host, location and message all come from the `events` row at draw
// time. Nothing here duplicates them. The moment a card stores its own copy of
// the title, a host edits the event, and the image they send to WhatsApp says
// something the invitation page doesn't — so this object holds composition
// only, plus one piece of decorative copy (`eyebrow`) that exists nowhere else.
//
// The flattened PNG/JPEG this produces lives in `events.card_image_key`. It is
// a derived artifact — a share asset and the link-preview image — never the
// source of truth. Losing it costs one re-render.
// ---------------------------------------------------------------------------

export const CARD_RATIOS = ["4:5", "1:1", "9:16"] as const;
// How the photo is masked. "full" is the full-bleed variant: the photo becomes
// the whole card and the text sits on a scrim over it.
export const CARD_FRAMES = ["arch", "circle", "rounded", "full"] as const;
export const TEXT_ALIGNMENTS = ["left", "center", "right"] as const;

// Photo placement inside its frame, in frame-relative units, so the same
// numbers survive a change of ratio or frame and mean the same thing at
// preview scale as at export scale. offset is a fraction of the overflow the
// zoom created, clamped to ±1 — there is no way to express "photo dragged off
// the card", which is the only bad state a free pixel offset would allow.
export const cardPhotoSchema = z.object({
  zoom: z.number().min(1).max(4).default(1),
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
});

export const cardSchema = z.object({
  ratio: z.enum(CARD_RATIOS).default("4:5"),
  frame: z.enum(CARD_FRAMES).default("arch"),
  align: z.enum(TEXT_ALIGNMENTS).default("center"),
  photo: cardPhotoSchema.default({ zoom: 1, offsetX: 0, offsetY: 0 }),
  // Darkening laid over the photo so text stays readable on a bright one.
  // Only meaningful for frame "full"; harmless elsewhere.
  overlay: z.number().min(0).max(0.85).default(0.35),
  // The one string that lives here rather than on the event: a decorative
  // label ("You're invited", "Save the date") with no meaning off the card.
  eyebrow: z.string().max(40).default("You're invited"),
  showMessage: z.boolean().default(true),
});

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
  // Optional for the same reason: every template seeded before the card
  // designer existed has no card block and must keep parsing.
  card: cardSchema.optional(),
});

// Every key optional — an event stores only what it changes from its template.
// `card` is partial two levels deep: dragging the photo must not have to
// restate the ratio, the frame and the eyebrow to save one number.
export const themeOverridesSchema = z
  .object({
    palette: paletteSchema.partial(),
    fonts: z.object({ heading: z.enum(FONT_CHOICES), body: z.enum(FONT_CHOICES) }).partial(),
    layout: z.enum(LAYOUTS),
    art: z.enum(COVER_ART),
    card: cardSchema.partial().extend({ photo: cardPhotoSchema.partial().optional() }),
  })
  .partial();

export type Theme = z.infer<typeof themeSchema>;
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;
export type CardDesign = z.infer<typeof cardSchema>;

export const DEFAULT_CARD: CardDesign = {
  ratio: "4:5",
  frame: "arch",
  align: "center",
  photo: { zoom: 1, offsetX: 0, offsetY: 0 },
  overlay: 0.35,
  eyebrow: "You're invited",
  showMessage: true,
};

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
  card: DEFAULT_CARD,
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
    card: resolveCard(resolvedBase.card, o.card),
  };
}

// Three layers, same order as everything else here: product default, then the
// template's card design, then the host's edits. Spread twice because `photo`
// is a nested object and a shallow spread of the override would replace the
// whole thing with whichever single field the host last dragged.
function resolveCard(
  templateCard: CardDesign | undefined,
  overrides: ThemeOverrides["card"],
): CardDesign {
  const base = { ...DEFAULT_CARD, ...(templateCard ?? {}) };
  return {
    ...base,
    ...(overrides ?? {}),
    photo: { ...base.photo, ...(overrides?.photo ?? {}) },
  };
}
