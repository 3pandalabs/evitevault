import { createSign } from "node:crypto";

// Gemini Omni straight from Google (Vertex AI), COPIED from AdVault's
// api/src/lib/ai/google/omni.ts (copy-not-import, like every shared piece in
// this org). Same auth and Interactions API shape; two deliberate differences
// for invitations:
//
//   - The clip SPEAKS. AdVault asks for "No dialogue" and plays clips muted;
//     here the host's words are put in the prompt as dialogue and Omni's
//     generated audio track IS the voice. So there is no TTS step on this path.
//   - Always image-to-video, 9:16: the first frame is the panda scene (simple)
//     or the host's own photo (pro).
//
// Why Google first: Cloud trial / startup credits can pay it, and it is the
// cheaper Omni route. Provider order is VIDEO_INVITE_PROVIDERS (default
// "vertex,fal"); the job tries Google first and falls back to fal's
// TTS + talking-avatar on ANY Google error. Unset GOOGLE_SA_KEY_B64 simply
// means fal only.
//
// Auth: service-account key (GOOGLE_SA_KEY_B64 = the JSON key, base64) traded
// for a one-hour OAuth token, signed with node:crypto (no google-auth-library).
// The account needs the Vertex AI User role; the project id comes from the key.

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

function serviceAccount(): ServiceAccount | null {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) return null;
  try {
    const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Partial<ServiceAccount>;
    return sa.client_email && sa.private_key && sa.project_id ? (sa as ServiceAccount) : null;
  } catch {
    return null;
  }
}

export function vertexConfigured(): boolean {
  return serviceAccount() !== null;
}

let cached: { token: string; expires: number } | null = null;

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = b64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error(`google token exchange failed: ${res.status}`);
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

const MODEL = process.env.VERTEX_OMNI_MODEL ?? "gemini-omni-1.2-flash";
const MAX_WAIT_MS = 10 * 60_000;
const POLL_MS = 5_000;
// Omni's longest clip.
export const OMNI_MAX_SECONDS = 15;

export type SpeakingClipRequest = {
  /** Scene and delivery, e.g. "Three cute cartoon pandas at a wedding, waving warmly." */
  scene: string;
  /** Exactly what is said, already cleaned. */
  dialogue: string;
  seconds: number;
  image: { bytes: Buffer; mimeType: string };
};

/** The prompt Omni gets (exported for tests): one shot, the line said verbatim. */
export function speakingPrompt(scene: string, dialogue: string): string {
  const line = dialogue.replace(/"/g, "'");
  return (
    `${scene} The person or character in the image looks at the camera and says, clearly and warmly, ` +
    `exactly these words and nothing else: "${line}" ` +
    "Single continuous shot, no scene cuts, no on-screen text, no music, natural lip sync."
  );
}

/** One speaking clip from Google. Throws on anything short of an MP4. */
export async function vertexSpeakingClip(req: SpeakingClipRequest): Promise<Buffer> {
  const sa = serviceAccount();
  if (!sa) throw new Error("vertex is not configured (GOOGLE_SA_KEY_B64)");
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${sa.project_id}/locations/global/interactions`;
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken(sa)}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`vertex omni ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as Record<string, unknown>;
  };

  const seconds = Math.min(OMNI_MAX_SECONDS, Math.max(4, Math.round(req.seconds)));
  const created = await call(base, {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      background: true,
      input: [
        { type: "text", text: speakingPrompt(req.scene, req.dialogue) },
        { type: "image", data: req.image.bytes.toString("base64"), mime_type: req.image.mimeType },
      ],
      response_format: [
        { type: "video", delivery: "inline", aspect_ratio: "9:16", resolution: "720p", duration: `${seconds}s` },
      ],
      generation_config: { video_config: { task: "image_to_video" } },
    }),
  });
  const id = created.id as string | undefined;
  if (!id) throw new Error(`vertex omni returned no interaction id: ${JSON.stringify(created).slice(0, 300)}`);

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const it = await call(`${base}/${id}`);
    const status = it.status as string | undefined;
    if (status === "completed") {
      const steps = (it.steps ?? []) as { type?: string; content?: { type?: string; data?: string }[] }[];
      const video = steps.find((s) => s.type === "model_output")?.content?.find((c) => c.type === "video");
      if (!video?.data) throw new Error("vertex omni completed without inline video");
      return Buffer.from(video.data, "base64");
    }
    if (status && ["failed", "cancelled", "incomplete"].includes(status)) {
      throw new Error(`vertex omni ${status}: ${JSON.stringify(it.error ?? it).slice(0, 300)}`);
    }
  }
  throw new Error("vertex omni timed out");
}
