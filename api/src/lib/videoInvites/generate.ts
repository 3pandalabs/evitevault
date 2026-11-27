import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../env.js";
import { presignDownload, r2 } from "../../plugins/r2.js";
import type { VideoInvite } from "../../db/schema.js";
import { composeTemplateVideo, ffmpegAvailable } from "./compose.js";
import { narrate } from "./tts.js";
import { animate, falConfigured, speak } from "./fal.js";
import { OMNI_MAX_SECONDS, vertexConfigured, vertexSpeakingClip } from "./google.js";
import {
  clampVariant,
  cleanTextLines,
  estimatedSeconds,
  OCCASION_LABELS,
  providersToTry,
  type TextLines,
  type VideoInviteOccasion,
  type VideoInviteTier,
  type VideoProvider,
} from "./policy.js";

// Makes one video for one queued order.
//
//   simple -> the occasion's template clip + the host's text, drawn by ffmpeg
//             in this container (compose.ts). No Google, no fal. Provider
//             recorded as "template".
//   pro    -> Google first (Vertex Omni speaks the line itself), fal second
//             (ElevenLabs voice + talking avatar), in VIDEO_INVITE_PROVIDERS
//             order; ANY error from one provider moves on to the next.

export function configuredProviders(): Record<VideoProvider, boolean> {
  return { vertex: vertexConfigured(), fal: falConfigured() };
}

/** Whether a tier can be made on this deployment. */
export function tierAvailable(tier: VideoInviteTier): boolean {
  if (tier === "simple") return ffmpegAvailable();
  return providersToTry(process.env.VIDEO_INVITE_PROVIDERS, configuredProviders()).length > 0;
}

function sceneText(occasion: string): string {
  const label = OCCASION_LABELS[occasion as VideoInviteOccasion] ?? "celebration";
  return `A warm, friendly personal ${label.toLowerCase()} invitation video.`;
}

async function r2Image(key: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const obj = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  const bytes = Buffer.from(await obj.Body!.transformToByteArray());
  return { bytes, mimeType: obj.ContentType ?? "image/jpeg" };
}

export type GenerationResult = {
  bytes: Buffer;
  provider: VideoProvider | "template";
  errors: string[];
  /** Simple: who spoke the narration ('google' | 'fal'), null = no voice. */
  voiceProvider?: string | null;
};

export async function generateVideo(order: VideoInvite): Promise<GenerationResult> {
  if (order.tier === "simple") {
    const lines = cleanTextLines((order.textLines ?? {}) as Partial<TextLines>);
    // Narrator voiceover (Google TTS first, fal second, cached); none = the
    // video is still made, text on screen only.
    const errors: string[] = [];
    const voice = order.narration ? await narrate(order.narration, (m) => errors.push(m)) : null;
    const bytes = await composeTemplateVideo(env.WEB_ORIGIN, order.occasion, lines, {
      variant: clampVariant(order.variant ?? 1),
      voice: voice?.bytes ?? null,
    });
    return { bytes, provider: "template", errors, voiceProvider: voice?.provider ?? null };
  }

  const providers = providersToTry(process.env.VIDEO_INVITE_PROVIDERS, configuredProviders());
  if (providers.length === 0) throw new Error("no video provider configured");
  if (!order.photoKey) throw new Error("pro order without a photo");
  const photoKey = order.photoKey;
  const scene = sceneText(order.occasion);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === "vertex") {
        const seconds = Math.min(OMNI_MAX_SECONDS, estimatedSeconds(order.script) + 2);
        const bytes = await vertexSpeakingClip({ scene, dialogue: order.script, seconds, image: await r2Image(photoKey) });
        return { bytes, provider, errors };
      }
      const audioUrl = await speak(order.script);
      const bytes = await animate(await presignDownload(photoKey), audioUrl, scene);
      return { bytes, provider, errors };
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 400));
    }
  }
  throw new Error(errors.join(" | "));
}
