// Makes a poster (still) for every Simple video invite clip, used by the
// form's preview and "Try another":
//
//   public/video-invites/clip-<occasion>-<n>.mp4  ->  clip-<occasion>-<n>.jpg
//   public/video-invites/clip-<occasion>.mp4      ->  clip-<occasion>.jpg
//
// Local ffmpeg only, nothing paid. Run after adding or replacing clips:
//
//   cd web && node scripts/make-clip-posters.mjs [--force]
//
// Existing posters are kept unless --force. The frame is taken 1 s in (past
// any fade from black), 540x960, JPG.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "video-invites");
const force = process.argv.includes("--force");

let made = 0;
for (const file of readdirSync(DIR)) {
  if (!/^clip-[a-z0-9-]+\.mp4$/.test(file)) continue;
  const poster = join(DIR, file.replace(/\.mp4$/, ".jpg"));
  if (existsSync(poster) && !force) continue;
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-y", "-ss", "1", "-i", join(DIR, file), "-frames:v", "1", "-vf", "scale=540:960", "-q:v", "4", poster],
    { stdio: "inherit" },
  );
  if (r.status === 0) made += 1;
  else console.error(`poster failed: ${file}`);
}
console.log(`posters made: ${made}`);
