"use client";

import { Download, ExternalLink, ImageUp, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  presignDownload,
  updateEvent,
  uploadCardImage,
  uploadCoverImage,
  type EventSummary,
  type Template,
  type ThemeOverrides,
} from "@/lib/api/host";
import { ensureCardFonts, loadImage, loadQrCode, rasterizeSvg } from "@/lib/card/assets";
import { renderCardToBlob, type CardFonts } from "@/lib/card/render";
import {
  CARD_SIZES,
  FRAME_LABELS,
  RATIO_LABELS,
  cardDateLines,
  qrInkFor,
  resolveCardDesign,
  type CardContent,
  type CardDesign,
  type CardFrame,
  type CardPalette,
  type CardRatio,
  type TextAlign,
} from "@/lib/card/spec";
import { ART_CHOICES, ART_LABELS, CoverArt } from "@/lib/coverArt";
import { ALL_FONTS } from "@/lib/fontStacks";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn, formatEventDate, formatEventTime, formatTimeZoneLabel } from "@/lib/utils";
import { ShareButtons, buildInviteMessage } from "../share";
import { CardCanvas } from "./card-canvas";

type EventRow = EventSummary & Record<string, unknown>;

const ACCEPTED = "image/jpeg,image/png,image/webp,image/avif";
// Matches ALLOWED_IMAGE_TYPES in api/src/plugins/r2.ts. Checked here as well so
// a wrong file fails at the file picker instead of after an upload round trip.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * The card designer.
 *
 * Two panes: the card on the left, the controls on the right, everything
 * redrawing as it is typed. What it edits is deliberately narrow — this screen
 * owns *composition*, and the event's own fields (title, date, place) stay on
 * the event form. The card reads them; it never keeps its own copy, so a host
 * who fixes a typo on the event form doesn't have to remember to come back here
 * and fix it again.
 *
 * The description is the one exception, editable here because it is the field
 * hosts most often write *for* the card and bouncing to another screen for one
 * sentence is a worse answer than a textarea. It is still the event's own
 * column, saved through the same endpoint — an edit here changes the invitation
 * page too, which is the point.
 *
 * Saving does two separate things, in this order:
 *   1. PATCH themeOverrides — the design, the thing worth keeping;
 *   2. render and upload the flattened image — derived, re-creatable.
 * If step 2 fails the host has lost nothing but a click.
 */
export function CardEditor({
  event,
  templates,
  onSaved,
}: {
  event: EventRow;
  templates: Template[];
  onSaved?: () => void;
}) {
  const template = templates.find((t) => t.id === event.templateId) ?? templates[0] ?? null;
  const storedOverrides = (event.themeOverrides as ThemeOverrides | null) ?? {};

  const [design, setDesign] = useState<CardDesign>(() =>
    resolveCardDesign(template?.theme.card, storedOverrides.card),
  );
  const [art, setArt] = useState<string>(storedOverrides.art ?? template?.theme.art ?? "plain");
  const [fonts, setFonts] = useState<CardFonts>({
    heading: storedOverrides.fonts?.heading ?? template?.theme.fonts.heading ?? "playfair",
    body: storedOverrides.fonts?.body ?? template?.theme.fonts.body ?? "inter",
  });
  const [accent, setAccent] = useState<string>(
    storedOverrides.palette?.accent ?? template?.theme.palette.accent ?? "#b45309",
  );

  // The event's own description, edited in place. Note this is the *event's*
  // field, not a card-local copy — the same string the invitation page renders,
  // saved back to the same column. Editing it from here is a convenience, not a
  // second home for it, which is the distinction the whole card design rests on.
  const [description, setDescription] = useState((event.description as string | null) ?? "");

  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(Boolean(event.coverImageKey));
  const [busy, setBusy] = useState<null | "photo" | "save" | "export">(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const palette: CardPalette = useMemo(
    () => ({
      ...(template?.theme.palette ?? {
        bg: "#faf7f2",
        surface: "#ffffff",
        text: "#1f2937",
        muted: "#6b7280",
        accent: "#b45309",
        accentText: "#ffffff",
      }),
      ...(storedOverrides.palette ?? {}),
      accent,
    }),
    // storedOverrides is re-read from the loaded event and never mutated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, accent],
  );

  const content: CardContent = useMemo(() => {
    const { dateLine, timeLine } = cardDateLines(
      event.startsAt,
      event.endsAt,
      event.timezone ?? "UTC",
    );
    return {
      title: event.title,
      hostName: (event.hostDisplayName as string | null) ?? null,
      dateLine,
      timeLine,
      locationName: event.locationName ?? null,
      message: description.trim() || null,
      url: displayUrl(event.slug),
    };
  }, [event, description]);

  // The QR and the printed line are now the same string — see displayUrl for
  // why the scheme earned its place back on the card.
  const qrUrl = useMemo(() => invitationUrl(event.slug), [event.slug]);
  const hasMessage = Boolean(content.message?.trim());
  const descriptionDirty = description.trim() !== ((event.description as string | null) ?? "").trim();

  // The stored cover image is the card's photo — one photo per event, used by
  // the invitation page and the card alike. Exchanged for a short-lived read
  // URL because the bucket is private.
  useEffect(() => {
    const key = event.coverImageKey;
    if (!key) return;
    let cancelled = false;
    presignDownload(key)
      .then(({ url }) => {
        if (!cancelled) setPhotoSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the current photo.");
      });
    return () => {
      cancelled = true;
    };
  }, [event.coverImageKey]);

  const patch = useCallback(
    (next: Partial<CardDesign>) => setDesign((d) => ({ ...d, ...next })),
    [],
  );

  // --- photo ----------------------------------------------------------------

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Use a JPEG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That photo is over 12MB. Try a smaller version.");
      return;
    }

    setBusy("photo");
    setError(null);
    // Shown from the local file straight away — waiting on a round trip to R2
    // before the host can see their own photo makes the editor feel broken on a
    // slow connection.
    const localUrl = URL.createObjectURL(file);
    setPhotoSrc(localUrl);
    setHasPhoto(true);
    patch({ photo: { zoom: 1, offsetX: 0, offsetY: 0 } });

    try {
      await uploadCoverImage(event.id, file);
    } catch (err) {
      setPhotoSrc(null);
      setHasPhoto(false);
      setError(err instanceof ApiError ? uploadMessage(err) : "The photo couldn't be uploaded.");
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    setBusy("photo");
    setError(null);
    try {
      await updateEvent(event.id, { coverImageKey: null });
      setPhotoSrc(null);
      setHasPhoto(false);
    } catch {
      setError("The photo couldn't be removed.");
    } finally {
      setBusy(null);
    }
  }

  // --- save & export --------------------------------------------------------

  /**
   * Renders the card off-screen at export scale. Separate from the preview
   * because the preview's canvas is sized to the pane it lives in; this one is
   * always the full 1080-wide grid at 2×.
   */
  const renderExport = useCallback(async () => {
    await ensureCardFonts([fonts.heading, fonts.body]);

    const { width, height } = CARD_SIZES[design.ratio];
    const artSvg = document.getElementById("card-export-art")?.querySelector("svg");
    const [photo, artImg, qr] = await Promise.all([
      photoSrc ? loadImage(photoSrc).catch(() => null) : Promise.resolve(null),
      artSvg ? rasterizeSvg(artSvg as SVGSVGElement, width, height).catch(() => null) : Promise.resolve(null),
      design.showQr ? loadQrCode(qrUrl, qrInkFor(palette)).catch(() => null) : Promise.resolve(null),
    ]);

    return renderCardToBlob({
      design,
      palette,
      fonts,
      content,
      assets: { photo, art: artImg, qr },
    });
  }, [design, palette, fonts, content, photoSrc, qrUrl]);

  function overridesToSave(): ThemeOverrides {
    return {
      ...storedOverrides,
      art,
      fonts,
      palette: { ...(storedOverrides.palette ?? {}), accent },
      card: design,
    };
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      // One PATCH, so an edited description and the design it was written for
      // can't half-land. Sent only when it actually changed — this endpoint is
      // shared with the event form, and a no-op write here would still bump
      // updated_at and look like an edit in any history built on it.
      await updateEvent(event.id, {
        themeOverrides: overridesToSave(),
        ...(descriptionDirty ? { description: description.trim() || null } : {}),
      });

      const { blob, contentType } = await renderExport();
      await uploadCardImage(event.id, blob, contentType);

      setSavedAt(new Date().toLocaleTimeString());
      onSaved?.();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Your session expired. Sign in again and retry."
          : "The card couldn't be saved. Your design is still on screen — try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("export");
    setError(null);
    try {
      const { blob, contentType } = await renderExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invitation-${event.slug.slice(0, 8)}.${contentType === "image/png" ? "png" : "jpg"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The image couldn't be generated.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setDesign(resolveCardDesign(template?.theme.card, undefined));
    setArt(template?.theme.art ?? "plain");
    setFonts({
      heading: template?.theme.fonts.heading ?? "playfair",
      body: template?.theme.fonts.body ?? "inter",
    });
    setAccent(template?.theme.palette.accent ?? "#b45309");
  }

  // --- render ---------------------------------------------------------------

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mx-auto max-w-[440px]">
          <CardCanvas
            design={design}
            palette={palette}
            fonts={fonts}
            content={content}
            art={art}
            photoSrc={photoSrc}
            qrUrl={qrUrl}
            onPhotoPan={(offset) => patch({ photo: { ...design.photo, ...offset } })}
          />
          <p className="mt-3 text-center text-sm text-slate-500">
            {hasPhoto
              ? "Drag the card to reposition the photo."
              : "Add a photo, or keep the template's artwork."}
          </p>

          {/* The link the card prints, as an actual anchor.
              The card is a flat image: the URL on it is pixels, and no chat app
              can turn pixels into a tap target. So the card is the picture and
              this is the link — sent together, the picture is what gets looked
              at and this is what gets opened. Everything below hands the host a
              *clickable* copy: the anchor itself, the clipboard, and the share
              buttons, whose message body carries the full https:// URL that
              WhatsApp, Messages and mail clients all auto-link. */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">Invitation link</p>
              {event.status !== "published" ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Draft
                </span>
              ) : null}
            </div>

            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-start gap-1.5 break-all text-sm text-slate-700 underline underline-offset-4 hover:text-slate-900"
            >
              {qrUrl}
              <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
            </a>

            {event.status === "published" ? (
              <>
                <div className="mt-3">
                  <ShareButtons
                    compact
                    url={qrUrl}
                    subject={event.title}
                    message={buildInviteMessage({
                      title: event.title,
                      whenLabel: `${formatEventDate(event.startsAt, event.timezone)} at ${formatEventTime(event.startsAt, event.timezone)} ${formatTimeZoneLabel(event.startsAt, event.timezone)}`,
                      url: qrUrl,
                      hostName: (event.hostDisplayName as string | null) ?? null,
                    })}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Send the card image and this link together — the text on the card can&apos;t be
                  tapped, this can.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-amber-700">
                This link won&apos;t work for guests until you publish the event.
              </p>
            )}
          </div>
        </div>

        {/* A second copy of the artwork at export size, kept out of the preview
            component so the export never depends on the preview being mounted
            and laid out. */}
        <div id="card-export-art" aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
          <CoverArt art={art} palette={palette} />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <Section title="Photo">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={onPickPhoto}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy === "photo"}
            >
              {busy === "photo" ? <Loader2 className="animate-spin" /> : <ImageUp />}
              {hasPhoto ? "Replace" : "Upload photo"}
            </Button>
            {hasPhoto && (
              <Button type="button" variant="ghost" onClick={removePhoto} disabled={busy === "photo"}>
                <Trash2 />
                Remove
              </Button>
            )}
          </div>

          {hasPhoto && (
            <Slider
              label="Zoom"
              value={design.photo.zoom}
              min={1}
              max={4}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(zoom) => patch({ photo: { ...design.photo, zoom } })}
            />
          )}
        </Section>

        <Section title="Shape">
          <Choices
            label="Size"
            options={Object.entries(RATIO_LABELS) as [CardRatio, string][]}
            value={design.ratio}
            onChange={(ratio) => patch({ ratio })}
          />
          <Choices
            label="Photo frame"
            options={Object.entries(FRAME_LABELS) as [CardFrame, string][]}
            value={design.frame}
            onChange={(frame) => patch({ frame })}
          />
          {design.frame === "full" && (
            <Slider
              label="Darken photo"
              value={design.overlay}
              min={0}
              max={0.85}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(overlay) => patch({ overlay })}
            />
          )}
        </Section>

        <Section title="Text">
          <div className="space-y-1.5">
            <Label htmlFor="card-eyebrow">Label above the title</Label>
            <Input
              id="card-eyebrow"
              value={design.eyebrow}
              maxLength={40}
              placeholder="You're invited"
              onChange={(e) => patch({ eyebrow: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              The title, date, place and message come from the event itself — edit them on the event
              form and this card follows.
            </p>
          </div>

          <Choices
            label="Alignment"
            options={[
              ["left", "Left"],
              ["center", "Centre"],
              ["right", "Right"],
            ] as [TextAlign, string][]}
            value={design.align}
            onChange={(align) => patch({ align })}
          />

          {/* Named after the field it actually reads, and editable in place —
              sending someone to another screen to write one sentence and come
              back is a worse answer than a textarea. */}
          <div className="space-y-2">
            <label
              className={cn(
                "flex items-center gap-2 text-sm",
                hasMessage ? "text-slate-700" : "text-slate-400",
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={design.showMessage && hasMessage}
                disabled={!hasMessage}
                onChange={(e) => patch({ showMessage: e.target.checked })}
              />
              Include the event description
            </label>

            <Textarea
              value={description}
              maxLength={5000}
              rows={3}
              placeholder="Join us for an evening of…"
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              {descriptionDirty ? (
                <span className="text-amber-700">
                  Unsaved — “Save card” updates the invitation page too.
                </span>
              ) : (
                "This is the event's own description, shared with the invitation page."
              )}
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
              checked={design.showQr}
              onChange={(e) => patch({ showQr: e.target.checked })}
            />
            <span>
              Show a QR code
              <span className="block text-xs text-slate-500">
                Scanning it opens the invitation and the RSVP form — worth keeping if the card gets
                printed or forwarded as a screenshot.
              </span>
            </span>
          </label>

          <Choices
            label="Heading font"
            options={ALL_FONTS.map((f) => [f, f.replace(/-/g, " ")] as [string, string])}
            value={fonts.heading}
            onChange={(heading) => setFonts((f) => ({ ...f, heading }))}
          />
          <Choices
            label="Body font"
            options={ALL_FONTS.map((f) => [f, f.replace(/-/g, " ")] as [string, string])}
            value={fonts.body}
            onChange={(body) => setFonts((f) => ({ ...f, body }))}
          />
        </Section>

        <Section title="Background">
          <Choices
            label="Artwork"
            options={ART_CHOICES.map((a) => [a, ART_LABELS[a]] as [string, string])}
            value={art}
            onChange={setArt}
          />
          <div className="space-y-1.5">
            <Label htmlFor="card-accent">Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="card-accent"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
              />
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                // The API rejects anything that isn't a hex colour — themes are
                // interpolated into CSS custom properties on a page every guest
                // loads. Keep the field in step with that.
                pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                className="font-mono"
              />
            </div>
          </div>
        </Section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
            Save card
          </Button>
          <Button type="button" variant="outline" onClick={download} disabled={busy !== null}>
            {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />}
            Download
          </Button>
          <Button type="button" variant="ghost" onClick={reset} disabled={busy !== null}>
            <RotateCcw />
            Reset
          </Button>
        </div>
        {savedAt && <p className="text-sm text-emerald-700">Saved at {savedAt}.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small local controls. Deliberately not promoted to components/ui until a
// second screen needs them — an abstraction with one caller is just indirection.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-sm capitalize transition-colors",
              value === key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm tabular-nums text-slate-500">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-900"
      />
    </div>
  );
}

function invitationUrl(slug: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://evitevault.3pandalabs.com";
  return `${origin}/e/${slug}`;
}

/**
 * The link as printed on the card — the full `https://…`, scheme included.
 *
 * It used to be trimmed on the grounds that nobody types "https://". But the
 * card gets forwarded as an image into WhatsApp and iMessage, and what those
 * clients do with a screenshot is run OCR over it and offer the text they find
 * as a tappable link — which only works on something they can recognise as a
 * URL. The scheme is the strongest signal there is, and it is one line of the
 * card either way.
 */
function displayUrl(slug: string): string {
  return invitationUrl(slug);
}

function uploadMessage(err: ApiError): string {
  if (err.code === "unsupported_content_type") return "That image format isn't supported.";
  if (err.status === 401) return "Your session expired. Sign in again and retry.";
  return "The photo couldn't be uploaded.";
}
