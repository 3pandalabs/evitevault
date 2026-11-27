import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../../plugins/r2.js";
import { falConfigured, speak } from "./fal.js";
import { googleAccessToken, vertexConfigured } from "./google.js";
import { ttsCacheKey } from "./policy.js";
import { googleTtsBody, ttsVoice } from "./ttsRequest.js";

// The narrator voice for Simple video invites.
//
//   1. Google Cloud Text-to-Speech (texts:synthesize, the same service-account
//      token as Omni, GOOGLE_SA_KEY_B64), ONE fixed warm narrator voice
//      (TTS_VOICE, default en-US-Studio-O).
//   2. fal ElevenLabs (FAL_KEY), the same voice path Pro's fallback uses.
//      (No edge-tts: there is no cheap Node-only version without Python.)
//   3. Neither / both fail: no voice. The video is still made, text on screen.
//
// Identical (provider, voice, text) is synthesized once and cached in R2
// under tts/<sha256>.mp3, so "Try another" variant re-renders cost nothing.

const BUCKET = () => process.env.R2_BUCKET ?? "";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function cached(key: string): Promise<Buffer | null> {
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    return Buffer.from(await obj.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

async function store(key: string, bytes: Buffer): Promise<void> {
  await r2
    .send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: bytes, ContentType: "audio/mpeg" }))
    .catch(() => undefined);
}

async function googleTts(text: string, voice: string): Promise<Buffer> {
  const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { authorization: `Bearer ${await googleAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(googleTtsBody(text, voice)),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { audioContent?: string; error?: { message?: string } };
  if (!res.ok || !body.audioContent) throw new Error(`google tts ${res.status}: ${body.error?.message ?? "no audio"}`);
  return Buffer.from(body.audioContent, "base64");
}

async function falTts(text: string): Promise<Buffer> {
  const url = await speak(text);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`fal tts download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export type Narration = { bytes: Buffer; provider: "google" | "fal" } | null;

/** The narrator reading `text`, from the cache or the first provider that works. Never throws. */
export async function narrate(text: string, log: (m: string) => void = () => undefined): Promise<Narration> {
  if (!text.trim()) return null;
  const voice = ttsVoice();
  const providers: { name: "google" | "fal"; ok: boolean; run: () => Promise<Buffer>; voice: string }[] = [
    { name: "google", ok: vertexConfigured(), run: () => googleTts(text, voice), voice },
    { name: "fal", ok: falConfigured(), run: () => falTts(text), voice: process.env.FAL_VOICE || "Sarah" },
  ];
  for (const p of providers) {
    if (!p.ok) continue;
    const key = ttsCacheKey(p.name, p.voice, text, sha);
    const hit = await cached(key);
    if (hit) return { bytes: hit, provider: p.name };
    try {
      const bytes = await p.run();
      await store(key, bytes);
      return { bytes, provider: p.name };
    } catch (err) {
      log(`narration via ${p.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}
