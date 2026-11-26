"use client";

import { Download, Loader2, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureCardFonts, rasterizeSvg } from "@/lib/card/assets";
import { drawCardToCanvas, renderCardToBlob, type CardFonts } from "@/lib/card/render";
import { CARD_SIZES, type CardContent, type CardDesign, type CardPalette } from "@/lib/card/spec";
import { CoverArt } from "@/lib/coverArt";
import { Button } from "@/components/ui/button";

/**
 * A greeting's card — the live preview and the two ways it leaves the app.
 *
 * A greeting has no public page, so the rendered image IS the thing you send.
 * Both preview and export come from the same `drawCardToCanvas`/`renderCardToBlob`
 * pair the event designer uses, so what downloads is exactly what's on screen.
 * No upload and no QR: nothing server-side owns this image, and there's no link
 * for a code to resolve to (design.showQr is forced off by the caller).
 */
export function GreetingCard({
  design,
  palette,
  fonts,
  content,
  art,
}: {
  design: CardDesign;
  palette: CardPalette;
  fonts: CardFonts;
  content: CardContent;
  art: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artHostRef = useRef<HTMLDivElement>(null);
  const [artImg, setArtImg] = useState<{ key: string; img: HTMLImageElement } | null>(null);
  const [fontsReadyKey, setFontsReadyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [error, setError] = useState<string | null>(null);

  const artKey = `${art}|${design.ratio}|${palette.bg}|${palette.accent}|${palette.muted}|${palette.text}`;
  const fontKey = `${fonts.heading}|${fonts.body}`;
  const readyArt = artImg?.key === artKey ? artImg.img : null;

  // The template's artwork is SVG; the renderer draws bitmaps. Rasterise it once
  // at full card width and reuse that for both the preview and the export.
  useEffect(() => {
    let cancelled = false;
    const svg = artHostRef.current?.querySelector("svg");
    if (!svg) return;
    const { width, height } = CARD_SIZES[design.ratio];
    rasterizeSvg(svg as SVGSVGElement, width, height)
      .then((img) => {
        if (!cancelled) setArtImg({ key: artKey, img });
      })
      .catch(() => {
        /* Falls back to a flat accent wash — not worth an error. */
      });
    return () => {
      cancelled = true;
    };
  }, [artKey, design.ratio]);

  useEffect(() => {
    let cancelled = false;
    ensureCardFonts([fonts.heading, fonts.body]).finally(() => {
      if (!cancelled) setFontsReadyKey(fontKey);
    });
    return () => {
      cancelled = true;
    };
  }, [fonts.heading, fonts.body, fontKey]);

  const assets = useMemo(() => ({ photo: null, art: readyArt, qr: null }), [readyArt]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = canvas.parentElement?.clientWidth ?? 0;
    if (!cssWidth) return;
    const { width: W } = CARD_SIZES[design.ratio];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    drawCardToCanvas(canvas, { design, palette, fonts, content, assets }, (cssWidth * dpr) / W);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
  }, [design, palette, fonts, content, assets]);

  useEffect(() => {
    redraw();
  }, [redraw, fontsReadyKey]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [redraw]);

  async function buildBlob() {
    // Fonts must be in before the export draws, or the flattened image falls
    // back to a system face while the preview is correct.
    await ensureCardFonts([fonts.heading, fonts.body]);
    let exportArt: CanvasImageSource | null = readyArt;
    if (!exportArt) {
      const svg = artHostRef.current?.querySelector("svg");
      if (svg) {
        const { width, height } = CARD_SIZES[design.ratio];
        exportArt = await rasterizeSvg(svg as SVGSVGElement, width, height).catch(() => null);
      }
    }
    return renderCardToBlob({
      design,
      palette,
      fonts,
      content,
      assets: { photo: null, art: exportArt, qr: null },
    });
  }

  function filenameFor(contentType: string) {
    const base =
      content.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "greeting";
    return `${base}.${contentType === "image/png" ? "png" : "jpg"}`;
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onDownload() {
    setBusy("download");
    setError(null);
    try {
      const { blob, contentType } = await buildBlob();
      triggerDownload(blob, filenameFor(contentType));
    } catch {
      setError("Couldn't make the image. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    setError(null);
    try {
      const { blob, contentType } = await buildBlob();
      const filename = filenameFor(contentType);
      const file = new File([blob], filename, { type: contentType });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: content.title });
      } else {
        // No file-level Web Share (most desktop browsers): a download is the
        // honest fallback — still gets them the image to attach themselves.
        triggerDownload(blob, filename);
      }
    } catch (e) {
      // AbortError means they dismissed the share sheet; not a failure.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Couldn't share the image. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Source for the export rasteriser — hidden from view and assistive tech. */}
      <div
        aria-hidden
        ref={artHostRef}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      >
        <CoverArt art={art} palette={palette} />
      </div>

      <div className="mx-auto max-w-[360px]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={content.title || "Greeting card preview"}
          className="block w-full rounded-xl shadow-lg ring-1 ring-black/5"
        />
      </div>

      <div className="flex justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={busy !== null}>
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Download
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onShare} disabled={busy !== null}>
          {busy === "share" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Share
        </Button>
      </div>

      {error ? <p role="alert" className="text-center text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
