"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoverArt } from "@/lib/coverArt";
import { ensureCardFonts, loadImage, loadQrCode, rasterizeSvg } from "@/lib/card/assets";
import { drawCardToCanvas, photoOverflow, type CardAssets, type CardFonts } from "@/lib/card/render";
import {
  CARD_SIZES,
  qrInkFor,
  type CardContent,
  type CardDesign,
  type CardPalette,
} from "@/lib/card/spec";
import { cn } from "@/lib/utils";

/**
 * The live preview — a canvas, drawn by the same code that produces the export.
 *
 * It is a canvas rather than styled DOM on purpose. A DOM preview has to be
 * translated into the exported image by something (html2canvas, an SVG
 * rasteriser), and every one of those translations is a place for the two to
 * disagree. Here there is nothing to translate: the preview *is* the export at
 * a smaller scale.
 *
 * The cost is that canvas text isn't in the accessibility tree, so the canvas
 * carries a label describing the card, and the invitation guests actually open
 * (/e/[slug]) stays ordinary HTML.
 */
export function CardCanvas({
  design,
  palette,
  fonts,
  content,
  art,
  photoSrc,
  qrUrl,
  onPhotoPan,
  className,
}: {
  design: CardDesign;
  palette: CardPalette;
  fonts: CardFonts;
  content: CardContent;
  art: string;
  photoSrc: string | null;
  /** The full https:// link the QR code resolves to — not the trimmed one printed on the card. */
  qrUrl: string;
  onPhotoPan?: (offset: { offsetX: number; offsetY: number }) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artHostRef = useRef<HTMLDivElement>(null);

  // Each loaded asset is stored with the input it was loaded for, and the value
  // the renderer uses is derived by comparing that against the current input.
  // Keeping the "which photo is this?" check in the derivation rather than in a
  // second state update means a stale image can never be drawn for one frame
  // after the source changes — the old bitmap simply stops matching.
  const [loadedPhoto, setLoadedPhoto] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null);
  const [loadedArt, setLoadedArt] = useState<{ key: string; img: HTMLImageElement } | null>(null);
  const [loadedQr, setLoadedQr] = useState<{ key: string; img: HTMLImageElement } | null>(null);
  const [readyFonts, setReadyFonts] = useState<string | null>(null);

  const artKey = `${art}|${design.ratio}|${palette.bg}|${palette.accent}|${palette.muted}|${palette.text}`;
  const fontKey = `${fonts.heading}|${fonts.body}`;
  const qrInk = qrInkFor(palette);
  const qrKey = `${qrUrl}|${qrInk}`;

  const assets: CardAssets = useMemo(
    () => ({
      photo: loadedPhoto?.src === photoSrc ? loadedPhoto.img : null,
      art: loadedArt?.key === artKey ? loadedArt.img : null,
      qr: loadedQr?.key === qrKey ? loadedQr.img : null,
    }),
    [loadedPhoto, photoSrc, loadedArt, artKey, loadedQr, qrKey],
  );
  const photoError = Boolean(photoSrc) && failedPhotoSrc === photoSrc;
  const fontsReady = readyFonts === fontKey;

  // --- assets ---------------------------------------------------------------

  useEffect(() => {
    if (!photoSrc) return;
    let cancelled = false;

    loadImage(photoSrc)
      .then((img) => {
        if (!cancelled) setLoadedPhoto({ src: photoSrc, img });
      })
      .catch(() => {
        if (!cancelled) setFailedPhotoSrc(photoSrc);
      });
    return () => {
      cancelled = true;
    };
  }, [photoSrc]);

  // Rasterised at the card's full width so the export is sharp; the preview
  // scales the same bitmap down, which costs nothing and avoids re-rasterising
  // on every resize.
  useEffect(() => {
    let cancelled = false;
    const svg = artHostRef.current?.querySelector("svg");
    if (!svg) return;

    const { width, height } = CARD_SIZES[design.ratio];
    rasterizeSvg(svg as SVGSVGElement, width, height)
      .then((img) => {
        if (!cancelled) setLoadedArt({ key: artKey, img });
      })
      .catch(() => {
        /* The card falls back to a flat accent wash — worth no error UI. */
      });
    return () => {
      cancelled = true;
    };
  }, [artKey, design.ratio]);

  useEffect(() => {
    let cancelled = false;
    loadQrCode(qrUrl, qrInk)
      .then((img) => {
        if (!cancelled) setLoadedQr({ key: qrKey, img });
      })
      .catch(() => {
        /* The printed URL still gets people there; no error UI for this. */
      });
    return () => {
      cancelled = true;
    };
  }, [qrUrl, qrInk, qrKey]);

  useEffect(() => {
    let cancelled = false;
    ensureCardFonts([fonts.heading, fonts.body]).finally(() => {
      if (!cancelled) setReadyFonts(fontKey);
    });
    return () => {
      cancelled = true;
    };
  }, [fonts.heading, fonts.body, fontKey]);

  // --- drawing --------------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cssWidth = canvas.parentElement?.clientWidth ?? 0;
    if (!cssWidth) return;

    const { width: W } = CARD_SIZES[design.ratio];
    // Cap at 2× device pixels: past that the preview costs real time to redraw
    // on every drag frame and nobody can see the difference.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    drawCardToCanvas(canvas, { design, palette, fonts, content, assets }, (cssWidth * dpr) / W);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
  }, [design, palette, fonts, content, assets]);

  useEffect(() => {
    redraw();
  }, [redraw, fontsReady]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [redraw]);

  // --- dragging the photo ---------------------------------------------------

  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const canPan = Boolean(assets.photo && onPhotoPan);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: design.photo.offsetX,
      offsetY: design.photo.offsetY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start || !assets.photo || !onPhotoPan) return;

    // CSS pixels → card units → a fraction of the overflow, which is the unit
    // the offsets are stored in. Halved because ±1 spans the whole overflow.
    const rect = e.currentTarget.getBoundingClientRect();
    const perCardUnit = rect.width / CARD_SIZES[design.ratio].width;
    const over = photoOverflow(design, intrinsic(assets.photo));

    const dx = over.x ? ((e.clientX - start.x) / perCardUnit / over.x) * 2 : 0;
    const dy = over.y ? ((e.clientY - start.y) / perCardUnit / over.y) * 2 : 0;

    onPhotoPan({
      offsetX: clamp(start.offsetX + dx, -1, 1),
      offsetY: clamp(start.offsetY + dy, -1, 1),
    });
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <div className={cn("relative", className)}>
      {/* The template's artwork, rendered once so it can be serialised for the
          canvas. Hidden from view and from assistive tech — it is a source, not
          content. */}
      <div ref={artHostRef} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <CoverArt art={art} palette={palette} />
      </div>

      <canvas
        ref={canvasRef}
        role="img"
        aria-label={cardDescription(content, design)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "block w-full rounded-xl shadow-lg ring-1 ring-black/5",
          canPan && "cursor-grab touch-none active:cursor-grabbing",
        )}
      />

      {photoError && (
        <p className="mt-2 text-sm text-amber-700">
          That photo couldn&apos;t be loaded for the preview. Re-upload it and try again.
        </p>
      )}
    </div>
  );
}

function intrinsic(img: CanvasImageSource): { width: number; height: number } {
  if (img instanceof HTMLImageElement) return { width: img.naturalWidth, height: img.naturalHeight };
  const el = img as HTMLCanvasElement;
  return { width: el.width ?? 0, height: el.height ?? 0 };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function cardDescription(content: CardContent, design: CardDesign): string {
  return [
    design.eyebrow,
    content.title,
    content.dateLine,
    content.timeLine,
    content.locationName,
    content.hostName ? `Hosted by ${content.hostName}` : null,
  ]
    .filter(Boolean)
    .join(". ");
}
