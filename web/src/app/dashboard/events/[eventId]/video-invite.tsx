"use client";

import { Clapperboard, Download, Loader2, Share2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  getVideoInvite,
  startVideoInviteCheckout,
  uploadVideoInvitePhoto,
  type VideoInviteInfo,
  type VideoInviteTier,
} from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  script_too_short: "Write a little more: at least a short sentence.",
  script_too_long: "That's too long for one video. Keep it short and warm.",
  script_has_link: "Leave links out: the invitation already has the link.",
  photo_required: "Add your photo first.",
  attestation_required: "Tick the box to confirm the photo.",
  video_invite_in_progress: "A video for this event is already being made.",
  video_invites_unavailable: "Video invites are not available right now. Please try again later.",
  checkout_failed: "Couldn't open the payment page. Please try again.",
  upload_failed: "The photo didn't upload. Please try again.",
  unsupported_content_type: "Use a JPG, PNG or WebP photo.",
};

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/**
 * Paid video invite on the event page. The host picks Simple (our three
 * pandas say their words) or Pro (their own photo says it), pays on Stripe's
 * page, and comes back here; the API makes the video in the background and
 * this card polls until it is ready. Renders nothing while the feature is off.
 */
export function VideoInviteCard({ eventId, title }: { eventId: string; title: string }) {
  const [info, setInfo] = useState<VideoInviteInfo | null>(null);
  const [tier, setTier] = useState<VideoInviteTier>("simple");
  const [occasion, setOccasion] = useState("party");
  const [script, setScript] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  useEffect(() => {
    if (!(state === "making" || (backFromStripe && state === "paying"))) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [state, backFromStripe, load]);

  if (!info) return null;

  const order = info.order;
  const chars = script.trim().length;

  async function onPay() {
    setError(null);
    setBusy(true);
    try {
      let photoKey: string | null = null;
      if (tier === "pro") {
        if (!photo) throw new ApiError(400, "photo_required");
        if (!attested) throw new ApiError(400, "attestation_required");
        photoKey = await uploadVideoInvitePhoto(eventId, photo);
      }
      const { checkoutUrl } = await startVideoInviteCheckout(eventId, {
        tier,
        occasion,
        script,
        photoKey,
        attested: tier === "pro" ? attested : undefined,
      });
      window.location.href = checkoutUrl;
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard className="size-4 text-slate-400" />
          Video invite
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {order?.state === "ready" && order.videoUrl ? (
          <div className="space-y-3">
            <video
              src={order.videoUrl}
              controls
              playsInline
              className="mx-auto max-h-[480px] w-full max-w-xs rounded-lg bg-black"
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
        ) : order?.state === "making" || (backFromStripe && order?.state === "paying") ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Payment received. We&apos;re making your video now. It usually takes a few minutes; you can leave this
            page and come back.
          </div>
        ) : order?.state === "failed" ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            We couldn&apos;t make this video. We&apos;ll refund your payment, usually within a few days. Sorry about that.
          </p>
        ) : null}

        {!info.available ? (
          <p className="text-sm text-slate-600">Video invites are not available right now. Please check back soon.</p>
        ) : order?.state === "making" ? null : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Turn your invitation into a short video your guests will love. Write what you&apos;d like to say and
              we&apos;ll make the video.
            </p>

            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Video type">
              {(["simple", "pro"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tier === t}
                  onClick={() => setTier(t)}
                  className={`rounded-lg border p-3 text-left text-sm ${
                    tier === t ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
                  }`}
                >
                  <span className="font-medium">
                    {t === "simple" ? "Simple" : "Pro"} · {money(info.prices[t])}
                  </span>
                  <span className="mt-1 block text-slate-600">
                    {t === "simple"
                      ? "Our three pandas say your words, in a scene for your occasion."
                      : "Your own photo comes to life and says your words."}
                  </span>
                </button>
              ))}
            </div>

            {tier === "simple" ? (
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
            ) : (
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
            )}

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

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <Button onClick={() => void onPay()} disabled={busy || chars < 10}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
              {order?.state === "ready" ? "Make a new video" : "Make my video"} · {money(info.prices[tier])}
            </Button>
            <p className="text-xs text-slate-500">
              You&apos;ll pay securely on Stripe. If we can&apos;t make your video, we refund you.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
