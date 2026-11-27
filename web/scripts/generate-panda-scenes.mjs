// OPTIONAL TOOL, for FUTURE occasions. The live scenes in
// web/public/video-invites/pandas-<occasion>.jpg were supplied by Anil (made
// in Muse, 2026-11-26) and are NOT produced by this script.
//
// It makes a candidate 9:16 panda scene per occasion and writes it to
// web/scripts/out/pandas-<occasion>.png (outside public/, so nothing goes live
// by accident). To use one: review it, convert to a 1080x1920 JPG (~q85, under
// ~500 KB) at web/public/video-invites/pandas-<occasion>.jpg, and add the
// occasion to VIDEO_INVITE_OCCASIONS.
//
// The pandas are OUR established three characters, so they look the same in
// every video, ad and post. This script EDITS the reference frame
// (scripts/panda-reference.png, from the 2026 Thanksgiving video) rather than
// generating pandas from text: left to right, the panda with round glasses and
// a white apron over a blue shirt, the panda in an orange t-shirt, the panda in
// a navy suit. Only the background and props change per occasion.
//
// Providers, same order as the app: Google first (Gemini image model on
// Vertex AI, service account GOOGLE_SA_KEY_B64, model VERTEX_IMAGE_MODEL), fal
// second (an image-edit endpoint, FAL_KEY, model FAL_IMAGE_MODEL). Any Google
// error tries fal for that occasion.
//
// Every image is a paid call (about $0.04 each on either provider at the time
// of writing). Run only with Anil's go-ahead:
//
//   cd web
//   GOOGLE_SA_KEY_B64=... FAL_KEY=... node scripts/generate-panda-scenes.mjs [--only wedding] [--force]
//
// Existing files in out/ are skipped unless --force. Review EVERY image: the
// three pandas must match the reference, the faces must be clear and
// front-facing with mouths visible (they get lip-synced), and there must be no
// text anywhere. Re-run one occasion with --only <name> --force.
//
// Keep OCCASIONS in step with VIDEO_INVITE_OCCASIONS in
// api/src/lib/videoInvites/policy.ts.

import { createSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OCCASIONS = {
  wedding: "an elegant wedding reception: flowers, fairy lights, a decorated stage and a wedding cake",
  birthday: "a colorful birthday party: balloons, streamers, wrapped presents and a birthday cake with candles",
  "baby-shower": "a soft pastel baby shower: pastel balloons, a cake and baby gifts",
  anniversary: "a romantic anniversary dinner: candles, roses and champagne glasses",
  graduation: "a graduation celebration: graduation caps, diplomas and confetti",
  housewarming: "a cozy new home: a front porch with plants, a welcome mat and moving boxes",
  diwali: "a Diwali celebration: glowing diyas, colorful rangoli and marigold garlands",
  holiday: "a festive winter holiday party: a decorated tree, warm lights and wrapped presents",
  party: "a fun house party: string lights, snacks and drinks",
  // The reference itself, recomposed to 9:16 with the title removed.
  thanksgiving: "the same Thanksgiving feast as in the reference image: roast turkey, pumpkins, corn and autumn leaves",
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE = join(HERE, "panda-reference.png");
const OUT_DIR = join(HERE, "out");

function prompt(scene) {
  return [
    "Edit this image. Keep these exact three panda characters, left to right:",
    "the panda with round gold glasses wearing a white apron over a blue shirt,",
    "the panda in an orange t-shirt, and the panda in a navy suit.",
    "Keep their faces, fur, outfits, proportions and the soft 3D animated art style exactly the same.",
    `Change the setting to ${scene}.`,
    "Vertical 9:16 portrait composition. The three pandas stand or sit together in the middle third of the frame,",
    "facing the camera, smiling, with their faces and mouths clearly visible and unobstructed (they will be animated to speak).",
    "Hands may hold an occasion-appropriate prop, but nothing in front of the faces.",
    "Remove ALL text: no words, letters, titles, captions, signs, banners or logos anywhere in the image.",
  ].join(" ");
}

// --- Google (Vertex AI, Gemini image model) ----------------------------------
// Same service-account flow as api/src/lib/videoInvites/google.ts.

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function serviceAccount() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) return null;
  try {
    const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch {
    return null;
  }
}

let token = null;
async function googleToken(sa) {
  if (token) return token;
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
  const sig = b64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`google token exchange failed: ${res.status}`);
  token = json.access_token;
  return token;
}

const VERTEX_IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL ?? "gemini-2.5-flash-image";

async function googleEdit(sa, reference, text) {
  const url =
    `https://aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/global/` +
    `publishers/google/models/${VERTEX_IMAGE_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${await googleToken(sa)}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "image/png", data: reference.toString("base64") } }, { text }],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`vertex ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error(`vertex returned no image: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(part.inlineData.data, "base64");
}

// --- fal (image edit) ---------------------------------------------------------

const FAL_IMAGE_MODEL = process.env.FAL_IMAGE_MODEL ?? "fal-ai/nano-banana/edit";

async function falEdit(reference, text) {
  const res = await fetch(`https://fal.run/${FAL_IMAGE_MODEL}`, {
    method: "POST",
    headers: { authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: text,
      image_urls: [`data:image/png;base64,${reference.toString("base64")}`],
      num_images: 1,
      aspect_ratio: "9:16",
      output_format: "png",
    }),
  });
  const json = await res.json().catch(() => ({}));
  const url = json?.images?.[0]?.url;
  if (!res.ok || !url) throw new Error(`fal ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`fal download ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

// --- run ----------------------------------------------------------------------

const sa = serviceAccount();
const hasFal = Boolean(process.env.FAL_KEY);
if (!sa && !hasFal) {
  console.error("Set GOOGLE_SA_KEY_B64 and/or FAL_KEY (this script spends money; see the header).");
  process.exit(1);
}

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const force = argv.includes("--force");
if (only && !OCCASIONS[only]) {
  console.error(`Unknown occasion "${only}". Known: ${Object.keys(OCCASIONS).join(", ")}`);
  process.exit(1);
}

const reference = readFileSync(REFERENCE);
mkdirSync(OUT_DIR, { recursive: true });

for (const [occasion, scene] of Object.entries(OCCASIONS)) {
  if (only && only !== occasion) continue;
  const out = join(OUT_DIR, `pandas-${occasion}.png`);
  if (existsSync(out) && !force) {
    console.log(`${occasion}: exists, skipped (use --force to redo)`);
    continue;
  }
  const text = prompt(scene);
  let bytes = null;
  if (sa) {
    try {
      bytes = await googleEdit(sa, reference, text);
      console.log(`${occasion}: made by Google (${VERTEX_IMAGE_MODEL})`);
    } catch (err) {
      console.warn(`${occasion}: Google failed, trying fal: ${err.message}`);
    }
  }
  if (!bytes && hasFal) {
    try {
      bytes = await falEdit(reference, text);
      console.log(`${occasion}: made by fal (${FAL_IMAGE_MODEL})`);
    } catch (err) {
      console.error(`${occasion}: fal failed: ${err.message}`);
    }
  }
  if (bytes) writeFileSync(out, bytes);
}
