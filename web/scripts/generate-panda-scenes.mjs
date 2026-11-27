// Generates the panda scene images the "Simple" video invite starts from:
// one 9:16 picture per occasion of our three pandas, written to
// web/public/video-invites/pandas-<occasion>.png and served from the web app
// (the API passes the public URL to Google / fal).
//
// NOT RUN YET: every image is a paid fal call (~9 images, roughly $0.05-0.40
// total depending on the model). Run only with Anil's go-ahead:
//
//   cd web && FAL_KEY=... node scripts/generate-panda-scenes.mjs [--only wedding]
//
// Until it runs, every occasion falls back to pandas-default.png (the brand's
// three-pandas mark), see api/src/lib/videoInvites/generate.ts. Review each
// image before committing: the talking-avatar step needs clear, front-facing
// faces, and nothing in the picture should be text.
//
// Keep this list in step with VIDEO_INVITE_OCCASIONS in
// api/src/lib/videoInvites/policy.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCENES = {
  wedding: "an elegant wedding reception with flowers, fairy lights and a decorated stage",
  birthday: "a colorful birthday party with balloons, streamers and a cake",
  "baby-shower": "a soft pastel baby shower with balloons and a cake",
  anniversary: "a romantic anniversary dinner with candles and roses",
  graduation: "a graduation celebration with caps, diplomas and confetti",
  housewarming: "a cozy new home with a front door, plants and a welcome mat",
  diwali: "a Diwali celebration with diyas, rangoli and marigold garlands",
  holiday: "a festive winter holiday party with a decorated tree and warm lights",
  party: "a fun house party with string lights and snacks",
};

const MODEL = process.env.FAL_IMAGE_MODEL ?? "fal-ai/flux/dev";
const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY is required (this script spends money; see the header).");
  process.exit(1);
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "video-invites");
mkdirSync(outDir, { recursive: true });

for (const [occasion, setting] of Object.entries(SCENES)) {
  if (only && only !== occasion) continue;
  const prompt =
    `Three cute, friendly cartoon pandas (one tall in the middle, two smaller beside it) standing together, ` +
    `facing the camera, smiling, at ${setting}. Soft 3D animated film style, warm light, clear faces, ` +
    `full bodies visible, vertical composition. No text, no letters, no logos.`;
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: { authorization: `Key ${KEY}`, "content-type": "application/json" },
    // PNG so the bytes match the .png name the web app serves them under.
    body: JSON.stringify({ prompt, image_size: "portrait_16_9", num_images: 1, output_format: "png" }),
  });
  const out = await res.json();
  const url = out?.images?.[0]?.url;
  if (!res.ok || !url) {
    console.error(`${occasion}: failed`, res.status, JSON.stringify(out).slice(0, 200));
    continue;
  }
  const img = await fetch(url);
  writeFileSync(join(outDir, `pandas-${occasion}.png`), Buffer.from(await img.arrayBuffer()));
  console.log(`${occasion}: saved`);
}
