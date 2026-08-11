// The card's coordinate system and the data it draws from.
//
// Everything the renderer needs is expressed here in *card units* — a fixed
// pixel grid per aspect ratio — and the canvas is scaled to fit. That is what
// lets the same draw code produce a 380px live preview and a 2160px export
// with identical layout: nothing measures the DOM, nothing depends on the
// device pixel ratio, and a font size of 84 means the same fraction of the
// card at every scale.
//
// The design values here mirror api/src/lib/theme.ts. That file is the
// authority — it validates what gets stored — and this one must not grow a
// knob the API would reject.

export type CardRatio = "4:5" | "1:1" | "9:16";
export type CardFrame = "arch" | "circle" | "rounded" | "full";
export type TextAlign = "left" | "center" | "right";

export type CardDesign = {
  ratio: CardRatio;
  frame: CardFrame;
  align: TextAlign;
  photo: { zoom: number; offsetX: number; offsetY: number };
  overlay: number;
  eyebrow: string;
  showMessage: boolean;
};

export type CardPalette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
};

/**
 * What the card says. Every field is read from the `events` row at draw time —
 * see the note in api/src/lib/theme.ts about why the design never keeps its own
 * copy of the title.
 */
export type CardContent = {
  title: string;
  hostName: string | null;
  dateLine: string;
  timeLine: string | null;
  locationName: string | null;
  message: string | null;
  /** Printed along the bottom edge, because a forwarded image is a dead end without it. */
  url: string;
};

/**
 * A stored design — every field optional, `photo` optional field by field.
 * Both layers that can override the defaults (a template's card, an event's
 * themeOverrides.card) have this shape, and it mirrors what the API accepts.
 */
export type CardDesignOverrides = Partial<Omit<CardDesign, "photo">> & {
  photo?: Partial<CardDesign["photo"]>;
};

export const DEFAULT_CARD: CardDesign = {
  ratio: "4:5",
  frame: "arch",
  align: "center",
  photo: { zoom: 1, offsetX: 0, offsetY: 0 },
  overlay: 0.35,
  eyebrow: "You're invited",
  showMessage: true,
};

// 1080 wide throughout: the width WhatsApp, Instagram and iMessage all
// downscale from without resampling twice.
//   4:5  — the portrait ratio that survives a feed crop intact
//   1:1  — safest for a WhatsApp status thumbnail
//   9:16 — full-screen stories
export const CARD_SIZES: Record<CardRatio, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

export const RATIO_LABELS: Record<CardRatio, string> = {
  "4:5": "Portrait · 4:5",
  "1:1": "Square · 1:1",
  "9:16": "Story · 9:16",
};

export const FRAME_LABELS: Record<CardFrame, string> = {
  arch: "Arch",
  circle: "Circle",
  rounded: "Rounded",
  full: "Full bleed",
};

/**
 * Merges a stored override over the defaults. The API does the same merge
 * server-side (resolveTheme); this exists so the editor can work on a complete
 * object without waiting for a round trip after every change.
 */
export function resolveCardDesign(
  templateCard: CardDesignOverrides | undefined,
  overrides: CardDesignOverrides | undefined,
): CardDesign {
  // `photo` is rebuilt at each layer rather than spread with the rest: a
  // shallow spread of a partial photo would replace the whole object with
  // whichever single field was saved last, so dragging the photo would silently
  // reset the zoom.
  const base: CardDesign = {
    ...DEFAULT_CARD,
    ...(templateCard ?? {}),
    photo: { ...DEFAULT_CARD.photo, ...(templateCard?.photo ?? {}) },
  };
  return {
    ...base,
    ...(overrides ?? {}),
    photo: { ...base.photo, ...(overrides?.photo ?? {}) },
  };
}

/** Wall-clock date and time in the event's own zone, not the viewer's. */
export function cardDateLines(
  startsAt: string,
  endsAt: string | null,
  timeZone: string,
): { dateLine: string; timeLine: string } {
  const start = new Date(startsAt);
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(start);

  const time = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
      .format(d)
      .toUpperCase();

  const end = endsAt ? new Date(endsAt) : null;
  return {
    dateLine: date,
    timeLine: end ? `${time(start)} – ${time(end)}` : time(start),
  };
}
