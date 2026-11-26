"use client";

import { Download, Loader2, Mail, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { sendGreeting } from "@/lib/api/host";
import { ensureCardFonts, rasterizeSvg } from "@/lib/card/assets";
import { drawCardToCanvas, renderCardToBlob, type CardFonts } from "@/lib/card/render";
import { CARD_SIZES, type CardContent, type CardDesign, type CardPalette } from "@/lib/card/spec";
import { CoverArt } from "@/lib/coverArt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseEmails(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      // Strip the "data:<type>;base64," prefix — the gateway wants raw base64.
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

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
  greetingId,
}: {
  design: CardDesign;
  palette: CardPalette;
  fonts: CardFonts;
  content: CardContent;
  art: string;
  /** When present, the card can be emailed. Only a saved greeting has an id. */
  greetingId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artHostRef = useRef<HTMLDivElement>(null);
  const [artImg, setArtImg] = useState<{ key: string; img: HTMLImageElement } | null>(null);
  const [fontsReadyKey, setFontsReadyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "share" | "send">(null);
  const [error, setError] = useState<string | null>(null);

  const [showSend, setShowSend] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendDone, setSendDone] = useState<string | null>(null);

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

  async function onSend() {
    if (!greetingId) return;
    const emails = parseEmails(recipients);
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    setSendDone(null);
    if (emails.length === 0) {
      setSendError("Enter at least one email address.");
      return;
    }
    if (bad) {
      setSendError(`That doesn't look like an email: ${bad}`);
      return;
    }

    setBusy("send");
    setSendError(null);
    try {
      const { blob, contentType } = await buildBlob();
      const image = { content: await blobToBase64(blob), type: contentType };
      const res = await sendGreeting(greetingId, {
        recipients: emails.map((email) => ({ email })),
        image,
      });
      if (!res.emailConfigured) {
        setSendError("Email isn't set up yet, so nothing was sent.");
      } else if (res.delivered === 0) {
        setSendError("Couldn't deliver to anyone — check the addresses and try again.");
      } else {
        setSendDone(
          `Sent to ${res.delivered} of ${res.recipientCount}${
            res.delivered < res.recipientCount ? " — the rest couldn't be delivered" : ""
          }.`,
        );
        setRecipients("");
      }
    } catch (e) {
      setSendError(
        e instanceof ApiError && e.status === 401
          ? "Your session expired. Sign in again."
          : "Couldn't send. Try again.",
      );
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
        {greetingId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSend((v) => !v)}
            disabled={busy !== null}
            aria-expanded={showSend}
          >
            <Mail className="size-4" />
            Send by email
          </Button>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-center text-xs text-red-600">{error}</p> : null}

      {greetingId && showSend ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
          <label htmlFor="greeting-recipients" className="text-xs font-medium text-slate-700">
            Email addresses
          </label>
          <Textarea
            id="greeting-recipients"
            rows={3}
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="maria@example.com, liam@example.com"
            className="bg-white text-sm"
          />
          <p className="text-xs text-slate-500">
            Separate with commas, spaces or new lines. They each get the card above — no RSVP, no
            reply needed.
          </p>
          {sendError ? <p role="alert" className="text-xs text-red-600">{sendError}</p> : null}
          {sendDone ? <p className="text-xs font-medium text-emerald-700">{sendDone}</p> : null}
          <Button type="button" size="sm" onClick={onSend} disabled={busy !== null}>
            {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Send greeting
          </Button>
        </div>
      ) : null}
    </div>
  );
}
