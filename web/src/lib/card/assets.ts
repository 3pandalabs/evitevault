"use client";

// Everything the renderer needs but cannot draw itself: decoded images, the
// template's SVG artwork turned into a bitmap, and fonts that are actually
// loaded before the first stroke of text.

import { FONT_STACKS, googleFontsHrefFor } from "../fontStacks";

/**
 * Decodes an image for the canvas.
 *
 * `crossOrigin` matters more than it looks: an image drawn from another origin
 * without CORS taints the canvas, and the taint only announces itself later, as
 * a SecurityError from toBlob() when the host clicks Export. Photos come back
 * from R2 as presigned URLs on a different origin, so the bucket must send
 * `Access-Control-Allow-Origin` for the web app — see infra/RUNBOOK.md. Local
 * blob: URLs are same-origin and unaffected, which is why a card exports fine
 * right after upload and fails the next day if the CORS rule is missing.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/**
 * Rasterises a template's cover artwork straight from the `<svg>` React
 * already rendered.
 *
 * Reusing the live element is the point: the twelve artworks in lib/coverArt
 * stay the single definition of what a template looks like, and the card can
 * never drift from the invitation page the way a hand-ported canvas copy of
 * each pattern would. Serialise, hand it to an <img> as a data URL, draw.
 */
export function rasterizeSvg(
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));
  // The component sizes itself to its container with inline styles and a class;
  // inside a standalone SVG document both are noise, and the class would refer
  // to a stylesheet that isn't there.
  clone.removeAttribute("style");
  clone.removeAttribute("class");

  const markup = new XMLSerializer().serializeToString(clone);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
}

// The family name as CSS knows it, pulled off the front of the stack so the
// allowlist in fontStacks.ts stays the only place a font is named.
function familyName(key: string): string {
  return (FONT_STACKS[key] ?? FONT_STACKS.inter).split(",")[0].replace(/['"]/g, "").trim();
}

const STYLESHEET_ID = "rsvpvault-card-fonts";

/**
 * Guarantees the chosen fonts are ready before drawing.
 *
 * Canvas takes fonts from `document.fonts`, and an unloaded family silently
 * falls back — so a card drawn a beat too early renders in Times, looks wrong,
 * and looks right after any change forces a redraw. Await this before the first
 * draw and after every font switch.
 */
export async function ensureCardFonts(families: string[]): Promise<void> {
  if (typeof document === "undefined") return;

  const href = googleFontsHrefFor(families);
  let link = document.getElementById(STYLESHEET_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = STYLESHEET_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;

  // Every weight the renderer asks for, by name: document.fonts.load resolves
  // immediately for a weight nobody requested, which would let a 600 title draw
  // as a synthesised bold of the 400 face.
  await Promise.all(
    families.flatMap((f) =>
      [400, 500, 600].map((w) =>
        document.fonts.load(`${w} 64px "${familyName(f)}"`).catch(() => []),
      ),
    ),
  );
  await document.fonts.ready;
}
