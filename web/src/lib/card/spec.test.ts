import { describe, expect, it } from "vitest";
import { DEFAULT_CARD, contrastWithWhite, qrInkFor, resolveCardDesign } from "./spec";

// The QR code is drawn on a white quiet-zone panel, so its modules must
// contrast with *white* — not with the theme's own background. Getting that
// backwards shipped a blank white square on eight of the twenty-six seeded
// templates, every one of them a dark theme whose ink is near-white by design.
//
// These are the real palettes from api/src/db/seed.ts. Copied rather than
// imported because that module opens a database connection at import time; the
// point of keeping them here is that a new dark template added there should
// have its palette pasted in below, and the property test then holds it to the
// same bar.
const SEEDED_INKS: Record<string, { text: string; accent: string }> = {
  // The eight that were broken — every dark-background design in the set.
  "sangeet-night": { text: "#fdf4ff", accent: "#f0b429" },
  "emerald-nikah": { text: "#f0fdf9", accent: "#d8b26a" },
  "milestone-gold": { text: "#fafafa", accent: "#d4af37" },
  "retro-disco": { text: "#f5f3ff", accent: "#22d3ee" },
  "diwali-diyas": { text: "#fff8e7", accent: "#f0a500" },
  midnight: { text: "#f8fafc", accent: "#e0b23c" },
  "cocktail-noir": { text: "#fafaf9", accent: "#d97706" },
  "photo-first": { text: "#ffffff", accent: "#ffffff" },

  // A representative handful of the eighteen that were always fine, so a
  // regression that forced everything to near-black would fail too.
  "classic-cream": { text: "#1f2937", accent: "#b45309" },
  "marigold-mandap": { text: "#4a1d10", accent: "#c2410c" },
  "minimal-slate": { text: "#0f172a", accent: "#0f172a" },
  "garden-party": { text: "#22331f", accent: "#4f7a3a" },
};

// What a QR reader needs. Higher than the 4.5:1 of text contrast: the code is
// read by a phone camera, at an angle, often off someone else's screen.
const MIN_QR_CONTRAST = 7;

describe("contrastWithWhite", () => {
  // Anchors the maths itself, so a broken luminance function can't quietly make
  // every assertion below pass.
  it("puts black at 21:1 and white at 1:1", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 0);
    expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 1);
  });

  it("handles three-digit hex", () => {
    expect(contrastWithWhite("#000")).toBeCloseTo(contrastWithWhite("#000000"), 5);
  });
});

describe("qrInkFor", () => {
  it.each(Object.entries(SEEDED_INKS))(
    "returns a scannable ink for %s",
    (_key, palette) => {
      expect(contrastWithWhite(qrInkFor(palette))).toBeGreaterThanOrEqual(MIN_QR_CONTRAST);
    },
  );

  // The property that actually matters: there is no palette, seeded or
  // host-authored, that can produce an unscannable code. The accent is
  // host-editable in the designer, so this is not hypothetical.
  it("never returns an unscannable ink, however light the palette", () => {
    const adversarial = [
      { text: "#ffffff", accent: "#ffffff" },
      { text: "#fefefe", accent: "#fdfdfd" },
      { text: "#eeeeee", accent: "#dddddd" },
      { text: "#ffff00", accent: "#00ffff" },
    ];
    for (const palette of adversarial) {
      expect(contrastWithWhite(qrInkFor(palette))).toBeGreaterThanOrEqual(MIN_QR_CONTRAST);
    }
  });

  it("keeps the theme's own ink when it is dark enough", () => {
    expect(qrInkFor({ text: "#1f2937", accent: "#b45309" })).toBe("#1f2937");
  });

  it("falls back to the accent before giving up on the theme", () => {
    // Light ink, dark accent — reachable because the designer lets a host pick
    // an arbitrary accent over a dark template.
    expect(qrInkFor({ text: "#fdf4ff", accent: "#101010" })).toBe("#101010");
  });
});

describe("resolveCardDesign", () => {
  it("fills in the defaults when nothing is stored", () => {
    expect(resolveCardDesign(undefined, undefined)).toEqual(DEFAULT_CARD);
  });

  // The nested-partial case: a saved offsetX must not wipe out the zoom beside
  // it, which is what a plain shallow spread of the override would do.
  it("merges photo field by field rather than replacing the object", () => {
    const resolved = resolveCardDesign({ photo: { zoom: 2 } }, { photo: { offsetX: 0.5 } });
    expect(resolved.photo).toEqual({ zoom: 2, offsetX: 0.5, offsetY: 0 });
  });

  it("lets the event override the template", () => {
    expect(resolveCardDesign({ frame: "arch" }, { frame: "full" }).frame).toBe("full");
  });
});
