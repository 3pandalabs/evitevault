// The card renderer.
//
// One function draws the card, and both the live preview and the exported file
// call it. That is the whole point: a preview produced by a different code path
// than the export is a preview that lies, and the host only finds out after
// they have sent the image to two hundred people.
//
// It is deliberately Canvas 2D rather than html2canvas over a DOM preview:
//
//   - html2canvas reimplements a CSS engine, and this app's Tailwind v4 styles
//     are full of oklch()/color-mix(), which it cannot parse — it throws rather
//     than degrading;
//   - fonts loaded through document.fonts are available to ctx.font for free,
//     where an SVG-in-<img> rasterisation silently substitutes a fallback
//     unless every woff2 is inlined as base64;
//   - it removes a dependency from a bundle that ships to Cloudflare Workers.
//
// Nothing here touches the DOM or reads element sizes, so the same call
// produces a 380px preview and a 2160px export with identical layout.

import { fontStack } from "../fontStacks";
import {
  CARD_SIZES,
  type CardContent,
  type CardDesign,
  type CardPalette,
  type CardRatio,
} from "./spec";

export type CardFonts = { heading: string; body: string };

export type CardAssets = {
  /** The host's uploaded photo, already decoded. Null until they add one. */
  photo: CanvasImageSource | null;
  /** The template's SVG cover artwork, rasterised. Fills the hero when there is no photo. */
  art: CanvasImageSource | null;
  /**
   * The invitation's QR code, pre-rendered with a transparent background so the
   * card can paint its own quiet zone. Generated outside the renderer because a
   * QR is a pure function of the URL and `qrcode` already does it well.
   */
  qr: CanvasImageSource | null;
};

export type CardInput = {
  design: CardDesign;
  palette: CardPalette;
  fonts: CardFonts;
  content: CardContent;
  assets: CardAssets;
};

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Draws one card, filling the context's card-unit coordinate space. The caller
 * is responsible for sizing the canvas and applying the scale transform — see
 * `drawCardToCanvas`.
 */
export function drawCard(ctx: CanvasRenderingContext2D, input: CardInput) {
  const { design, palette } = input;
  const { width: W, height: H } = CARD_SIZES[design.ratio];

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  const fullBleed = design.frame === "full";
  const hero = heroRect(design, W, H);

  drawHero(ctx, input, hero, W, H);

  // Text sits below the hero, or over the lower half of a full-bleed photo.
  // The footer measures itself first so the stack is centred in what is
  // actually left, not in the space a card without a QR code would have had.
  const footerH = footerHeight(input, W, H);
  const top = fullBleed ? H * 0.44 : hero.y + hero.h + H * 0.045;
  drawTextStack(ctx, input, { top, bottom: H - footerH, W, H });
  drawFooter(ctx, input, W, H);
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/**
 * How far the photo can travel inside its frame, in card units, at the current
 * zoom. The editor turns a drag in CSS pixels into a change in `offsetX/Y` with
 * this: zero overflow on an axis means the photo already fits and dragging that
 * way does nothing, which is exactly what should happen.
 */
export function photoOverflow(
  design: CardDesign,
  img: { width: number; height: number },
): { x: number; y: number } {
  const { width: W, height: H } = CARD_SIZES[design.ratio];
  const r = heroRect(design, W, H);
  if (!img.width || !img.height) return { x: 0, y: 0 };

  const scale = Math.max(r.w / img.width, r.h / img.height) * design.photo.zoom;
  return {
    x: Math.max(0, img.width * scale - r.w),
    y: Math.max(0, img.height * scale - r.h),
  };
}

function heroRect(design: CardDesign, W: number, H: number): Rect {
  if (design.frame === "full") return { x: 0, y: 0, w: W, h: H };

  const margin = W * 0.075;
  const h = H * HERO_HEIGHT[design.ratio];

  if (design.frame === "circle") {
    // Bounded by the hero's height budget, not just the card's width — a circle
    // sized purely off the width is 821 units tall on a 4:5 card and leaves the
    // text a third of the room the other frames get.
    const d = Math.min(W - margin * 3.2, h);
    return { x: (W - d) / 2, y: margin * 1.2, w: d, h: d };
  }
  // Arch and rounded share a rect; only the corner radii differ.
  return { x: margin, y: margin, w: W - margin * 2, h };
}

// The hero's share of the card. Was a flat 50%, which is what left the text
// stack overflowing into the footer on 4:5 — the most common ratio and the
// default. Every value here is "what is left over after the type fits", not a
// composition preference.
const HERO_HEIGHT: Record<CardRatio, number> = {
  "4:5": 0.44,
  "1:1": 0.4,
  "9:16": 0.38,
};

function drawHero(ctx: CanvasRenderingContext2D, input: CardInput, r: Rect, W: number, H: number) {
  const { design, palette, assets } = input;

  ctx.save();
  heroPath(ctx, design, r);
  ctx.clip();

  if (assets.photo) {
    drawCovered(ctx, assets.photo, r, design.photo);
  } else if (assets.art) {
    drawCovered(ctx, assets.art, r, { zoom: 1, offsetX: 0, offsetY: 0 });
  } else {
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }

  // A photo is arbitrary: it can be a white wall or a night sky, and the text
  // has to stay legible on both. On a full-bleed card the scrim is the only
  // thing standing between the message and an unreadable card, so it is always
  // drawn — the host controls how heavy it is, not whether it exists.
  if (design.frame === "full") {
    const scrim = ctx.createLinearGradient(0, H * 0.25, 0, H);
    scrim.addColorStop(0, `rgba(0,0,0,${design.overlay * 0.25})`);
    scrim.addColorStop(0.45, `rgba(0,0,0,${design.overlay * 0.85})`);
    scrim.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, design.overlay * 1.15)})`);
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  if (design.frame !== "full") {
    ctx.save();
    heroPath(ctx, design, r);
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = W * 0.004;
    ctx.stroke();
    ctx.restore();
  }
}

function heroPath(ctx: CanvasRenderingContext2D, design: CardDesign, r: Rect) {
  ctx.beginPath();
  switch (design.frame) {
    case "full":
      ctx.rect(r.x, r.y, r.w, r.h);
      break;
    case "circle":
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
      break;
    case "arch":
      // Top radius half the width, which turns the top edge into a semicircle.
      roundRectPath(ctx, r, [r.w / 2, r.w / 2, r.w * 0.06, r.w * 0.06]);
      break;
    default:
      roundRectPath(ctx, r, [r.w * 0.06, r.w * 0.06, r.w * 0.06, r.w * 0.06]);
  }
}

// Written out rather than using ctx.roundRect: the arch needs per-corner radii
// larger than half the height, which the built-in clamps differently across
// browsers, and a frame that renders one shape in Safari and another in Chrome
// is a support ticket about "the export doesn't match the preview".
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  { x, y, w, h }: Rect,
  [tl, tr, br, bl]: [number, number, number, number],
) {
  const cap = (v: number) => Math.min(v, w / 2, h / 2);
  const [a, b, c, d] = [cap(tl), cap(tr), cap(br), cap(bl)];
  ctx.moveTo(x + a, y);
  ctx.lineTo(x + w - b, y);
  ctx.arcTo(x + w, y, x + w, y + b, b);
  ctx.lineTo(x + w, y + h - c);
  ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
  ctx.lineTo(x + d, y + h);
  ctx.arcTo(x, y + h, x, y + h - d, d);
  ctx.lineTo(x, y + a);
  ctx.arcTo(x, y, x + a, y, a);
  ctx.closePath();
}

/**
 * Cover-fit with pan and zoom. The offsets are fractions of the overflow the
 * zoom produced (see cardPhotoSchema), so ±1 pans exactly to the edge and the
 * frame can never show background through a gap.
 */
function drawCovered(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  r: Rect,
  photo: CardDesign["photo"],
) {
  const { width: iw, height: ih } = intrinsicSize(img);
  if (!iw || !ih) return;

  const scale = Math.max(r.w / iw, r.h / ih) * photo.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = r.x + (r.w - dw) / 2 + (photo.offsetX * Math.max(0, dw - r.w)) / 2;
  const dy = r.y + (r.h - dh) / 2 + (photo.offsetY * Math.max(0, dh - r.h)) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function intrinsicSize(img: CanvasImageSource): { width: number; height: number } {
  if (img instanceof HTMLImageElement) return { width: img.naturalWidth, height: img.naturalHeight };
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return { width: img.width, height: img.height };
  }
  const el = img as HTMLCanvasElement;
  return { width: el.width ?? 0, height: el.height ?? 0 };
}

// ---------------------------------------------------------------------------
// Text
//
// Blocks are measured first and drawn second, then the whole stack is centred
// in the space left over. Drawing as we go and hoping it fits is what produces
// a card whose message runs off the bottom edge for exactly the host whose
// message is one line longer than the one it was designed against.
// ---------------------------------------------------------------------------

type Block =
  | { kind: "text"; lines: string[]; size: number; lineHeight: number; font: string; color: string; gap: number; tracking: number }
  | { kind: "rule"; gap: number; color: string; width: number };

// How far the type may shrink before dropping the message is the better trade.
// Below about 70% the date and place stop being readable at the size these are
// actually looked at — a thumbnail in a chat list.
const MIN_TEXT_SCALE = 0.7;

/**
 * Builds the stack at a given scale, optionally without the message.
 *
 * Separate from drawing because the layout has to be *measured* before it can
 * be placed: the caller tries this at successively smaller scales until the
 * result fits the space between the hero and the footer. Wrapping changes with
 * size — a title that took two lines at full size may take one at 0.8 — so the
 * blocks genuinely have to be rebuilt each time rather than scaled after the
 * fact.
 */
function buildBlocks(
  ctx: CanvasRenderingContext2D,
  input: CardInput,
  box: { W: number; H: number },
  scale: number,
  includeMessage: boolean,
): Block[] {
  const { design, palette, fonts, content } = input;
  const { W, H } = box;
  const onPhoto = design.frame === "full";

  const pad = W * 0.1;
  const contentW = W - pad * 2;
  const ink = onPhoto ? "#ffffff" : palette.text;
  const inkMuted = onPhoto ? "rgba(255,255,255,0.82)" : palette.muted;
  const accent = onPhoto ? "#ffffff" : palette.accent;

  const heading = fontStack(fonts.heading);
  const body = fontStack(fonts.body);

  // Type sizes and the gaps between blocks shrink together, so a tight card
  // reads as a smaller version of the same design rather than the same type
  // crammed into less room.
  const s = (v: number) => H * v * scale;

  const blocks: Block[] = [];

  if (design.eyebrow.trim()) {
    blocks.push(
      textBlock(ctx, design.eyebrow.toUpperCase(), {
        size: s(0.021),
        weight: 500,
        family: body,
        color: accent,
        maxWidth: contentW,
        maxLines: 1,
        lineHeight: 1.2,
        gap: 0,
        tracking: 0.22,
      }),
    );
  }

  // The title is the one block allowed to change size: it is host-supplied and
  // unbounded, and a two-word title and a fourteen-word title should both look
  // deliberate. Everything else keeps its size and truncates.
  blocks.push(
    fittedTextBlock(ctx, content.title, {
      startSize: s(design.ratio === "1:1" ? 0.058 : 0.064),
      minSize: s(0.03),
      weight: 600,
      family: heading,
      color: ink,
      maxWidth: contentW,
      maxLines: 3,
      lineHeight: 1.15,
      gap: s(0.02),
      tracking: 0,
    }),
  );

  blocks.push({ kind: "rule", gap: s(0.024), color: accent, width: W * 0.11 });

  blocks.push(
    textBlock(ctx, content.dateLine, {
      size: s(0.025),
      weight: 500,
      family: body,
      color: ink,
      maxWidth: contentW,
      maxLines: 2,
      lineHeight: 1.35,
      gap: s(0.024),
      tracking: 0.02,
    }),
  );

  if (content.timeLine) {
    blocks.push(
      textBlock(ctx, content.timeLine, {
        size: s(0.022),
        weight: 400,
        family: body,
        color: inkMuted,
        maxWidth: contentW,
        maxLines: 1,
        lineHeight: 1.35,
        gap: s(0.008),
        tracking: 0.06,
      }),
    );
  }

  if (content.locationName) {
    blocks.push(
      textBlock(ctx, content.locationName, {
        size: s(0.022),
        weight: 400,
        family: body,
        color: inkMuted,
        maxWidth: contentW,
        maxLines: 2,
        lineHeight: 1.35,
        gap: s(0.013),
        tracking: 0,
      }),
    );
  }

  if (content.hostName) {
    blocks.push(
      textBlock(ctx, `Hosted by ${content.hostName}`, {
        size: s(0.019),
        weight: 400,
        family: body,
        color: inkMuted,
        maxWidth: contentW,
        maxLines: 1,
        lineHeight: 1.3,
        gap: s(0.016),
        tracking: 0,
      }),
    );
  }

  if (includeMessage && design.showMessage && content.message?.trim()) {
    blocks.push(
      textBlock(ctx, content.message.trim(), {
        size: s(0.019),
        weight: 400,
        family: body,
        color: inkMuted,
        maxWidth: contentW * 0.92,
        maxLines: 4,
        lineHeight: 1.5,
        gap: s(0.022),
        tracking: 0,
      }),
    );
  }

  return blocks;
}

function stackHeight(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + blockHeight(b) + b.gap, 0);
}

function drawTextStack(
  ctx: CanvasRenderingContext2D,
  input: CardInput,
  box: { top: number; bottom: number; W: number; H: number },
) {
  const { design } = input;
  const { W, H } = box;
  const onPhoto = design.frame === "full";
  const pad = W * 0.1;
  const available = box.bottom - box.top;

  // Shrink to fit, rather than overflowing into the footer.
  //
  // The previous version anchored an oversized stack to the top and let it run
  // off the bottom, on the theory that losing the message beat losing the
  // title. On a 4:5 card that theory is wrong in practice: the hero takes half
  // the height, so a perfectly ordinary event — title, date, time, place, host
  // — measures about 474 units against 299 available and lands squarely on top
  // of the QR code. Nothing is dropped silently now; it is scaled until it fits.
  let scale = 1;
  let includeMessage = true;
  let blocks = buildBlocks(ctx, input, box, scale, includeMessage);

  for (let i = 0; i < 8; i++) {
    const total = stackHeight(blocks);
    if (total <= available) break;

    if (scale > MIN_TEXT_SCALE) {
      // Proportional step, nudged past the target so a stack whose wrapping
      // changes on the way down still converges inside the iteration budget.
      scale = Math.max(MIN_TEXT_SCALE, scale * (available / total) * 0.98);
    } else if (includeMessage) {
      // Out of scale headroom. The message is the one block that is genuinely
      // optional — it is the only thing here a guest can also read on the
      // invitation page itself — so it goes before the type gets illegible.
      includeMessage = false;
      scale = 1;
    } else {
      break;
    }
    blocks = buildBlocks(ctx, input, box, scale, includeMessage);
  }

  const total = stackHeight(blocks);
  let y = box.top + Math.max(0, (available - total) / 2);
  if (total > available) y = box.top;

  const anchorX = design.align === "left" ? pad : design.align === "right" ? W - pad : W / 2;

  ctx.save();
  // Belt and braces. The shrink loop above should make this unreachable, but a
  // clip is a guarantee where a calculation is only an argument — and the thing
  // it guarantees is that text can never be painted over the QR code, which is
  // the one element on the card that stops working entirely when obscured.
  ctx.beginPath();
  ctx.rect(0, box.top, W, available);
  ctx.clip();

  ctx.textAlign = design.align === "center" ? "center" : design.align;
  ctx.textBaseline = "alphabetic";
  // Text over a photograph needs its own separation from the image; the scrim
  // handles the average case and this handles the bright patch.
  if (onPhoto) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = H * 0.012;
  }

  for (const block of blocks) {
    y += block.gap;
    if (block.kind === "rule") {
      const x0 =
        design.align === "left" ? pad : design.align === "right" ? W - pad - block.width : (W - block.width) / 2;
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = block.color;
      ctx.globalAlpha = onPhoto ? 0.9 : 0.75;
      ctx.fillRect(x0, y, block.width, Math.max(2, H * 0.0022));
      ctx.restore();
      y += blockHeight(block);
      continue;
    }

    ctx.font = block.font;
    ctx.fillStyle = block.color;
    setTracking(ctx, block.tracking * block.size);
    // `y` tracks the top of the next line box; the baseline sits a half-leading
    // plus roughly one ascender below it. Approximating the ascender at 0.78em
    // rather than reading TextMetrics keeps the layout identical across the six
    // allowed fonts, which matters more here than being exact for one of them.
    const halfLeading = (block.size * (block.lineHeight - 1)) / 2;
    for (const line of block.lines) {
      ctx.fillText(line, anchorX, y + halfLeading + block.size * 0.78);
      y += block.size * block.lineHeight;
    }
    setTracking(ctx, 0);
  }
  ctx.restore();
}

// The footer is the only part of the card laid out from the bottom up, so its
// height has to be known before the text above it can be centred.
const URL_SIZE = 0.0165;
const BOTTOM_GAP = 0.035;
const QR_SIZE = 0.115;

function footerHeight(input: CardInput, W: number, H: number): number {
  const base = H * BOTTOM_GAP + H * URL_SIZE * 1.5;
  const qr = input.design.showQr && input.assets.qr ? W * QR_SIZE + H * 0.022 : 0;
  return base + qr;
}

function drawFooter(ctx: CanvasRenderingContext2D, input: CardInput, W: number, H: number) {
  const { design, palette, fonts, content, assets } = input;
  const onPhoto = design.frame === "full";
  const pad = W * 0.1;
  const urlSize = H * URL_SIZE;
  const urlBaseline = H - H * BOTTOM_GAP;

  ctx.save();

  if (design.showQr && assets.qr) {
    const s = W * QR_SIZE;
    const x =
      design.align === "left" ? pad : design.align === "right" ? W - pad - s : (W - s) / 2;
    const y = urlBaseline - urlSize * 1.6 - s;

    // A white panel under the code, always — not for looks but for scanning.
    // The quiet zone is part of the QR specification, and a code drawn straight
    // onto a photograph or a coloured background is one a phone gives up on.
    const quiet = s * 0.07;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    roundRectPath(
      ctx,
      { x: x - quiet, y: y - quiet, w: s + quiet * 2, h: s + quiet * 2 },
      [s * 0.08, s * 0.08, s * 0.08, s * 0.08],
    );
    ctx.fill();
    ctx.drawImage(assets.qr, x, y, s, s);
  }

  ctx.font = `500 ${urlSize}px ${fontStack(fonts.body)}`;
  ctx.fillStyle = onPhoto ? "rgba(255,255,255,0.75)" : palette.muted;
  ctx.textAlign = design.align === "center" ? "center" : design.align;
  ctx.textBaseline = "alphabetic";
  setTracking(ctx, urlSize * 0.08);
  const anchorX = design.align === "left" ? pad : design.align === "right" ? W - pad : W / 2;
  ctx.fillText(content.url, anchorX, urlBaseline, W * 0.86);
  ctx.restore();
}

// letterSpacing lands in Chrome 99 / Safari 17.4 / Firefox 127. Where it is
// missing the card renders with default tracking, which is a cosmetic
// difference, not a broken card — so it is set defensively rather than
// polyfilled by drawing character by character.
function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }
}

type TextOptions = {
  size: number;
  weight: number;
  family: string;
  color: string;
  maxWidth: number;
  maxLines: number;
  lineHeight: number;
  gap: number;
  tracking: number;
};

function textBlock(ctx: CanvasRenderingContext2D, text: string, o: TextOptions): Block {
  const font = `${o.weight} ${o.size}px ${o.family}`;
  ctx.save();
  ctx.font = font;
  setTracking(ctx, o.tracking * o.size);
  const lines = wrapText(ctx, text, o.maxWidth, o.maxLines);
  setTracking(ctx, 0);
  ctx.restore();

  return {
    kind: "text",
    lines,
    size: o.size,
    lineHeight: o.lineHeight,
    font,
    color: o.color,
    gap: o.gap,
    tracking: o.tracking,
  };
}

/** Shrinks until the text fits in `maxLines` without truncation, or bottoms out. */
function fittedTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: Omit<TextOptions, "size"> & { startSize: number; minSize: number },
): Block {
  let size = o.startSize;
  for (;;) {
    const block = textBlock(ctx, text, { ...o, size });
    const complete = block.kind === "text" && !block.lines[block.lines.length - 1]?.endsWith("…");
    if (complete || size <= o.minSize) return block;
    size = Math.max(o.minSize, size - o.startSize * 0.06);
  }
}

function blockHeight(b: Block): number {
  return b.kind === "rule" ? 2 : b.lines.length * b.size * b.lineHeight;
}

/**
 * Greedy word wrap, ellipsising once `maxLines` is reached. Long unbroken
 * strings (a URL someone pasted into the message) are broken mid-word rather
 * than allowed to overflow the card.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];

  // A blank line the host typed is a paragraph break, not an empty line on the
  // card — vertical rhythm here comes from the block gaps.
  for (const paragraph of text.split(/\n+/)) {
    let current = "";

    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      // A single word wider than the card — a pasted URL, usually — still has
      // to go somewhere, so break it mid-word rather than overflow the frame.
      let rest = word;
      while (ctx.measureText(rest).width > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    if (current) lines.push(current);
  }

  if (lines.length <= maxLines) return lines.length ? lines : [""];

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

// ---------------------------------------------------------------------------
// Canvas plumbing
// ---------------------------------------------------------------------------

/**
 * Sizes a canvas for the design and draws into it. `scale` is card units to
 * device pixels: the preview passes the CSS width it has, the export passes 1
 * or 2 for a 1080px or 2160px file.
 */
export function drawCardToCanvas(
  canvas: HTMLCanvasElement,
  input: CardInput,
  scale: number,
): void {
  const { width: W, height: H } = CARD_SIZES[input.design.ratio];
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingQuality = "high";
  drawCard(ctx, input);
}

/**
 * The exported file. JPEG when there is a photograph — a 2160×2700 PNG of a
 * photo is 6MB and WhatsApp recompresses it anyway — PNG when the card is flat
 * colour and text, where PNG is both smaller and sharper.
 */
export async function renderCardToBlob(
  input: CardInput,
  scale = 2,
): Promise<{ blob: Blob; contentType: "image/jpeg" | "image/png" }> {
  const canvas = document.createElement("canvas");
  drawCardToCanvas(canvas, input, scale);

  const contentType = input.assets.photo ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, contentType, 0.92),
  );
  if (!blob) throw new Error("card_export_failed");
  return { blob, contentType };
}
