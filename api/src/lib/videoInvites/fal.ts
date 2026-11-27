import { env } from "../../env.js";

// fal.ai queue client for video invites: ElevenLabs TTS, then a talking-avatar
// model that lip-syncs an image (the panda scene or the host's photo) to that
// audio. Same queue protocol AdVault uses (submit -> poll status_url ->
// read response_url). Never called from a request handler: only the job in
// jobs/videoInvites.ts, one order at a time.

const TTS_ENDPOINT = "fal-ai/elevenlabs/tts/eleven-v3";
const POLL_MS = 3000;
const TTS_TIMEOUT_MS = 2 * 60 * 1000;
// Avatar models take minutes for a 20 s clip.
const AVATAR_TIMEOUT_MS = 15 * 60 * 1000;

export function falConfigured(): boolean {
  return Boolean(env.FAL_KEY);
}

function headers() {
  return { authorization: `Key ${env.FAL_KEY}`, "content-type": "application/json" };
}

async function runQueued(endpoint: string, input: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60_000),
  });
  const job = (await submit.json().catch(() => ({}))) as { status_url?: string; response_url?: string };
  if (!submit.ok || !job.status_url || !job.response_url) {
    throw new Error(`fal submit failed (${endpoint}): ${submit.status} ${JSON.stringify(job).slice(0, 200)}`);
  }

  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = (await (
      await fetch(job.status_url, { headers: headers(), signal: AbortSignal.timeout(15_000) })
    ).json()) as { status?: string; error?: unknown };
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.error) {
      throw new Error(`fal job failed (${endpoint}): ${JSON.stringify(st).slice(0, 200)}`);
    }
    if (Date.now() - started > timeoutMs) throw new Error(`fal job timed out (${endpoint})`);
  }

  const res = await fetch(job.response_url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`fal result failed (${endpoint}): ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function pickUrl(out: Record<string, unknown>, field: "audio" | "video"): string {
  const nested = out[field] as { url?: string } | undefined;
  const url = nested?.url ?? (out[`${field}_url`] as string | undefined) ?? (out.url as string | undefined);
  if (!url) throw new Error(`fal returned no ${field}`);
  return url;
}

/** Text -> a fal-hosted audio URL (temporary, but long enough for the next step). */
export async function speak(text: string): Promise<string> {
  const out = await runQueued(TTS_ENDPOINT, { text, voice: env.FAL_VOICE, stability: 0.5 }, TTS_TIMEOUT_MS);
  return pickUrl(out, "audio");
}

/**
 * Image + audio -> MP4 bytes. `imageUrl` must be fetchable by fal: a public
 * URL (the panda scenes on the web origin) or a short-lived presigned R2 URL
 * (the host's photo).
 */
export async function animate(imageUrl: string, audioUrl: string, prompt: string): Promise<Buffer> {
  const out = await runQueued(
    env.FAL_AVATAR_ENDPOINT,
    { image_url: imageUrl, audio_url: audioUrl, prompt },
    AVATAR_TIMEOUT_MS,
  );
  const url = pickUrl(out, "video");
  const dl = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!dl.ok) throw new Error(`video download failed: ${dl.status}`);
  return Buffer.from(await dl.arrayBuffer());
}
