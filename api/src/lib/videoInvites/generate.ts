import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../env.js";
import { presignDownload, r2 } from "../../plugins/r2.js";
import type { VideoInvite } from "../../db/schema.js";
import { animate, falConfigured, speak } from "./fal.js";
import { OMNI_MAX_SECONDS, vertexConfigured, vertexSpeakingClip } from "./google.js";
import {
  estimatedSeconds,
  OCCASION_LABELS,
  providersToTry,
  type VideoInviteOccasion,
  type VideoProvider,
} from "./policy.js";

// Makes one video for one paid order. Google first (Vertex Omni speaks the
// line itself), fal second (ElevenLabs voice + talking avatar), in the order
// VIDEO_INVITE_PROVIDERS gives; ANY error from one provider moves on to the
// next. Throws only when every configured provider failed.

export function configuredProviders(): Record<VideoProvider, boolean> {
  return { vertex: vertexConfigured(), fal: falConfigured() };
}

export function generationAvailable(): boolean {
  return providersToTry(process.env.VIDEO_INVITE_PROVIDERS, configuredProviders()).length > 0;
}

/** Public URL of the panda scene for an occasion (served by the web app). */
export function pandaSceneUrl(occasion: string): string {
  return `${env.WEB_ORIGIN}/video-invites/pandas-${occasion}.png`;
}

// Until web/scripts/generate-panda-scenes.mjs has been run (paid image edits
// of our three-panda reference, so it needs Anil's go-ahead), every occasion
// falls back to this one image. It is a PLACEHOLDER (the brand's three-pandas
// logo mark, which talking models may animate poorly): after the script runs,
// replace it with the best reviewed general-purpose scene (e.g. "party").
export const PANDA_FALLBACK_PATH = "/video-invites/pandas-default.png";

function sceneText(order: Pick<VideoInvite, "tier" | "occasion">): string {
  const label = OCCASION_LABELS[order.occasion as VideoInviteOccasion] ?? "celebration";
  return order.tier === "pro"
    ? `A warm, friendly personal ${label.toLowerCase()} invitation video.`
    : `Three cute, friendly cartoon pandas at a ${label.toLowerCase()} celebration, festive and joyful.`;
}

async function fetchImage(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "image/png" };
}

async function r2Image(key: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const obj = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  const bytes = Buffer.from(await obj.Body!.transformToByteArray());
  return { bytes, mimeType: obj.ContentType ?? "image/jpeg" };
}

/** The first frame: the host's photo (pro) or the occasion's panda scene. */
async function startImage(order: VideoInvite): Promise<{ url: string; load: () => Promise<{ bytes: Buffer; mimeType: string }> }> {
  if (order.tier === "pro") {
    if (!order.photoKey) throw new Error("pro order without a photo");
    const key = order.photoKey;
    return { url: await presignDownload(key), load: () => r2Image(key) };
  }
  const scene = pandaSceneUrl(order.occasion);
  const head = await fetch(scene, { method: "HEAD", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const url = head?.ok ? scene : `${env.WEB_ORIGIN}${PANDA_FALLBACK_PATH}`;
  return { url, load: () => fetchImage(url) };
}

export type GenerationResult = { bytes: Buffer; provider: VideoProvider; errors: string[] };

export async function generateVideo(order: VideoInvite): Promise<GenerationResult> {
  const order_ = providersToTry(process.env.VIDEO_INVITE_PROVIDERS, configuredProviders());
  if (order_.length === 0) throw new Error("no video provider configured");
  const image = await startImage(order);
  const scene = sceneText(order);
  const errors: string[] = [];

  for (const provider of order_) {
    try {
      if (provider === "vertex") {
        const seconds = Math.min(OMNI_MAX_SECONDS, estimatedSeconds(order.script) + 2);
        const bytes = await vertexSpeakingClip({ scene, dialogue: order.script, seconds, image: await image.load() });
        return { bytes, provider, errors };
      }
      const audioUrl = await speak(order.script);
      const bytes = await animate(image.url, audioUrl, scene);
      return { bytes, provider, errors };
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 400));
    }
  }
  throw new Error(errors.join(" | "));
}
