"use client";

import { Clapperboard, Download, Loader2, Share2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  getVideoInvite,
  startVideoInviteCheckout,
  uploadVideoInvitePhoto,
  type VideoInviteInfo,
  type VideoInviteLines,
  type VideoInviteTier,
} from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  script_too_short: "Write a little more: at least a short sentence.",
  script_too_long: "That's too long for one video. Keep it short and warm.",
  script_has_link: "Leave links out: the invitation already has the link.",
  headline_required: "Add the main line (for example the names or the event).",
  narration_too_short: "Make the message to read out a little longer, or leave it empty.",
  narration_too_long: "The message to read out is too long. Keep it under 200 characters.",
  narration_has_link: "Leave links out of the message to read out.",
  line_too_long: "One of the lines is too long. Keep each one short.",
  line_has_link: "Leave links out: the invitation already has the link.",
  photo_required: "Add your photo first.",
  attestation_required: "Tick the box to confirm the photo.",
  video_invite_in_progress: "A video for this event is already being made.",
  video_invites_unavailable: "This video type is not available right now. Please try again later.",
  free_daily_limit: "You've made today's free videos. Please try again tomorrow.",
  checkout_failed: "Couldn't open the payment page. Please try again.",
  upload_failed: "The photo didn't upload. Please try again.",
  unsupported_content_type: "Use a JPG, PNG or WebP photo.",
};

const DEFAULT_LINE_MAX: Record<keyof VideoInviteLines, number> = { kicker: 40, headline: 60, when: 60, where: 80 };

const money = (cents: number) => (cents === 0 ? "Free" : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`);

/**
 * The live preview of a Simple video: the occasion's panda scene with the
 * host's lines in the top ~40%, roughly as the API's ffmpeg render draws them
 * (lib/videoInvites/policy.ts layoutTextLines). Sizes are in container-width
 * units so the 9:16 box looks the same at 360px and on a desktop.
 */
// The still for a variant, then the occasion's clip still, then its scene:
// clip-<occasion>-<n>.jpg exists once Muse's variant clips (and their posters,
// web/scripts/make-clip-posters.mjs) are in; until then the fallbacks show.
const posterChain = (occasion: string, variant: number) => [
  `/video-invites/clip-${occasion}-${variant}.jpg`,
  `/video-invites/clip-${occasion}.jpg`,
  `/video-invites/pandas-${occasion}.jpg`,
];

/** Strips emoji etc. the video's font can't draw, as the API does (stripUnsupportedGlyphs). */
const drawable = (t: string) =>
  t
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[‍︎️⃣]/g, "")
    .replace(/[^ -ɏ‐-‧‰-⁞€™]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function Poster({ occasion, variant }: { occasion: string; variant: number }) {
  const chain = posterChain(occasion, variant);
  const [step, setStep] = useState(0);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={chain[0]}
      src={chain[Math.min(step, chain.length - 1)]}
      onError={() => setStep((s) => Math.min(s + 1, chain.length - 1))}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * The live preview of a Simple video: the chosen variant's still with the
 * host's lines in the top area, roughly as the API's ffmpeg render draws them
 * (lib/videoInvites/policy.ts layoutTextLines, ~35% larger since 2026-11-26).
 * Sizes are in container-width units so the 9:16 box looks the same at 360px
 * and on a desktop.
 */
function SimplePreview({ occasion, variant, lines }: { occasion: string; variant: number; lines: VideoInviteLines }) {
  return (
    <div
      className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-lg bg-slate-900 [container-type:inline-size]"
      aria-label="Preview of your video"
    >
      <Poster key={`${occasion}-${variant}`} occasion={occasion} variant={variant} />
      <div className="absolute inset-x-0 top-0 h-[46%] bg-black/30" />
      <div
        className="absolute inset-x-[6.5%] top-[5%] flex h-[37%] flex-col items-center justify-center gap-[1.4cqw] text-center text-white"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
      >
        {lines.kicker ? <p className="text-[5.8cqw] leading-tight opacity-90">{drawable(lines.kicker)}</p> : null}
        <p className="text-[11cqw] font-medium leading-[1.05] [overflow-wrap:anywhere]">
          {drawable(lines.headline) || "Your main line"}
        </p>
        {lines.when ? <p className="text-[6.5cqw] leading-tight">{drawable(lines.when)}</p> : null}
        {lines.where ? <p className="text-[5.8cqw] leading-tight opacity-90">{drawable(lines.where)}</p> : null}
      </div>
    </div>
  );
}

/**
 * Video invite on the event page.
 *   Simple: our three pandas' template clip for the occasion, with the host's
 *           invitation text written on screen (made in seconds; may be free).
 *   Pro:    the host's own photo comes to life and says their words.
 * Paid orders go through Stripe's page and come back here; the API makes the
 * video in the background and this card polls until it is ready. Renders
 * nothing while the feature is off.
 */
export function VideoInviteCard({
  eventId,
  title,
  defaults,
}: {
  eventId: string;
  title: string;
  /** Prefill for the Simple lines, from the event. */
  defaults: { headline: string; when: string; where: string };
}) {
  const [info, setInfo] = useState<VideoInviteInfo | null>(null);
  const [tier, setTier] = useState<VideoInviteTier>("simple");
  const [occasion, setOccasion] = useState("party");
  const [lines, setLines] = useState<VideoInviteLines>({
    kicker: "You're invited to",
    headline: defaults.headline.slice(0, DEFAULT_LINE_MAX.headline),
    when: defaults.when.slice(0, DEFAULT_LINE_MAX.when),
    where: defaults.where.slice(0, DEFAULT_LINE_MAX.where),
  });
  const [script, setScript] = useState("");
  // Simple: which template clip ("Try another" cycles 1..5) and the narrator.
  const [variant, setVariant] = useState(1);
  const [narration, setNarration] = useState(() => {
    // Mirrors defaultNarration() in api/src/lib/videoInvites/policy.ts.
    const parts = [`You're invited to ${defaults.headline}`];
    if (defaults.when) parts.push(`on ${defaults.when}`);
    if (defaults.where) parts.push(`at ${defaults.where}`);
    return `${parts.join(" ")}. Come celebrate with us!`.slice(0, 200);
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getVideoInvite(eventId)
      .then(setInfo)
      .catch(() => undefined);
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    getVideoInvite(eventId)
      .then((next) => {
        if (alive) setInfo(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [eventId]);

  // Poll while the video is being made (or right after Stripe sent us back).
  const state = info?.order?.state ?? "none";
  const backFromStripe =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("video") === "paid";
  const waiting = state === "making" || ((backFromStripe || queued) && state !== "ready" && state !== "failed");
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [waiting, load]);

  if (!info) return null;

  const order = info.order;
  const lineMax = info.lineMax ?? DEFAULT_LINE_MAX;
  const tierOk = (t: VideoInviteTier) => info.tiers?.[t] ?? info.available;
  const price = info.prices[tier];
  const chars = script.trim().length;
  const canSubmit = tier === "simple" ? lines.headline.trim().length > 0 : chars >= 10;

  const setLine = (k: keyof VideoInviteLines) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLines((prev) => ({ ...prev, [k]: e.target.value }));

  async function onMake() {
    setError(null);
    setBusy(true);
    try {
      let photoKey: string | null = null;
      if (tier === "pro") {
        if (!photo) throw new ApiError(400, "photo_required");
        if (!attested) throw new ApiError(400, "attestation_required");
        photoKey = await uploadVideoInvitePhoto(eventId, photo);
      }
      const res = await startVideoInviteCheckout(eventId, {
        tier,
        occasion,
        ...(tier === "simple"
          ? { lines, variant, narration: narration.trim() || null }
          : { script, photoKey, attested }),
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      // Free: queued straight away.
      setQueued(true);
      setBusy(false);
      load();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "checkout_failed";
      setError(ERRORS[code] ?? "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  async function onShare(url: string) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "video-invite.mp4", { type: "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch {
      /* fall through to download */
    }
    window.open(url, "_blank", "noopener");
  }

  return (
    <Card className="rounded-2xl border-zinc-200 bg-white/90 shadow-zinc-900/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard className="size-4 text-slate-400" />
          Video invite
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {order?.state === "ready" && order.videoUrl && !waiting ? (
          <div className="space-y-3">
            <video
              src={order.videoUrl}
              controls
              playsInline
              className="mx-auto aspect-[9/16] max-h-[480px] w-full max-w-xs rounded-lg bg-black"
            />
            <p className="text-sm text-slate-600">
              Your video invite is ready. It also plays at the top of your invitation page.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void onShare(order.videoUrl!)}>
                <Share2 className="size-3.5" />
                Share
              </Button>
              <a href={order.videoUrl} download="video-invite.mp4">
                <Button variant="outline" size="sm">
                  <Download className="size-3.5" />
                  Download
                </Button>
              </a>
            </div>
          </div>
        ) : waiting ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            {order?.tier === "pro" || tier === "pro"
              ? "We're making your video now. It usually takes a few minutes; you can leave this page and come back."
              : "We're making your video now. It only takes a moment."}
          </div>
        ) : order?.state === "failed" ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            We couldn&apos;t make this video.{" "}
            {info.prices[order.tier] > 0 ? "We'll refund your payment, usually within a few days. " : ""}
            Sorry about that.
          </p>
        ) : null}

        {!info.available ? (
          <p className="text-sm text-slate-600">Video invites are not available right now. Please check back soon.</p>
        ) : waiting ? null : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Turn your invitation into a short video your guests will love.</p>

            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Video type">
              {(["simple", "pro"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tier === t}
                  disabled={!tierOk(t)}
                  onClick={() => setTier(t)}
                  className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${
                    tier === t ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
                  }`}
                >
                  <span className="font-medium">
                    {t === "simple" ? "Simple" : "Pro"} · {money(info.prices[t])}
                  </span>
                  <span className="mt-1 block text-slate-600">
                    {t === "simple"
                      ? "Our three pandas, with your invitation written on screen."
                      : "Your own photo comes to life and says your words."}
                  </span>
                </button>
              ))}
            </div>

            {tier === "simple" ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="video-occasion">Occasion</Label>
                    <select
                      id="video-occasion"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      {info.occasions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(
                    [
                      ["kicker", "Top line", "You're invited to"],
                      ["headline", "Main line", "Maya & Arjun's Wedding"],
                      ["when", "Date and time", "Saturday, Dec 12 · 6:30 PM"],
                      ["where", "Place", "The Grand Pavilion, Edison"],
                    ] as const
                  ).map(([k, label, ph]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`video-line-${k}`}>{label}</Label>
                      <Input
                        id={`video-line-${k}`}
                        value={lines[k]}
                        maxLength={lineMax[k]}
                        onChange={setLine(k)}
                        placeholder={ph}
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label htmlFor="video-narration">Message to read out</Label>
                    <Textarea
                      id="video-narration"
                      rows={3}
                      maxLength={info.maxScriptChars}
                      value={narration}
                      onChange={(e) => setNarration(e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      A narrator reads this over the music. {narration.trim().length}/{info.maxScriptChars} characters
                      · leave it empty for music only.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <SimplePreview occasion={occasion} variant={variant} lines={lines} />
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVariant((v) => (v % (info.variants ?? 5)) + 1)}
                    >
                      Try another
                    </Button>
                    <span>
                      {variant} of {info.variants ?? 5}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Your photo</Label>
                  <p className="text-xs text-slate-500">A clear, front-facing photo works best.</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()}>
                    <Upload className="size-3.5" />
                    {photo ? "Change photo" : "Choose photo"}
                  </Button>
                  {photo ? <p className="truncate text-xs text-slate-600">{photo.name}</p> : null}
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                      className="mt-0.5"
                    />
                    {info.attestationText}
                  </label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="video-script">What should the video say?</Label>
                  <Textarea
                    id="video-script"
                    rows={3}
                    maxLength={info.maxScriptChars}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Hi everyone! Join us for Maya's first birthday this Saturday. We can't wait to see you!"
                  />
                  <p className="text-xs text-slate-500">
                    {chars}/{info.maxScriptChars} characters · about {Math.max(3, Math.round(chars / 15))} seconds
                  </p>
                </div>
              </>
            )}

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <Button onClick={() => void onMake()} disabled={busy || !canSubmit || !tierOk(tier)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
              {order?.state === "ready" ? "Make a new video" : "Make my video"} · {money(price)}
            </Button>
            <p className="text-xs text-slate-500">
              {price === 0
                ? `Free: up to ${info.freePerDay ?? 5} a day.`
                : "You'll pay securely on Stripe. If we can't make your video, we refund you."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
