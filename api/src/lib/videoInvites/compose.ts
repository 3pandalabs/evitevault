import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  clipFileName,
  FRAME,
  layoutTextLines,
  TEXT_AREA,
  type DrawnLine,
  type TextLines,
} from "./policy.js";

// Simple video invites: the occasion's pre-made 8 s 9:16 template clip (our
// three pandas in the lower half, clean background in the top ~40%) with the
// host's text drawn into the top area by ffmpeg. Runs in the API container
// (ffmpeg is installed by api/Dockerfile), takes seconds, costs nothing.
//
// SAFETY: host text never enters the filter graph. Each line is written to its
// own file in a fresh temp directory and drawn with drawtext `textfile=`; the
// graph only ever names those files and the bundled font, and ffmpeg runs with
// that directory as its cwd so every path is a plain relative name. The
// arguments go to spawn() as an array, never through a shell.

export const FONT_PATH = resolve(process.cwd(), "assets/fonts/Geist-Regular.ttf");
const FFMPEG_TIMEOUT_MS = 120_000;

let ffmpegOk: boolean | null = null;

/** Whether ffmpeg runs here (cached). False on a dev box without it. */
export function ffmpegAvailable(): boolean {
  if (ffmpegOk === null) {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10_000 });
    ffmpegOk = r.status === 0;
  }
  return ffmpegOk;
}

/** Template clip URL for an occasion, and the default one to fall back to. */
export function clipUrls(webOrigin: string, occasion: string): [string, string] {
  return [`${webOrigin}/video-invites/${clipFileName(occasion)}`, `${webOrigin}/video-invites/${clipFileName("default")}`];
}

const ROLE_COLOR: Record<keyof TextLines, string> = {
  kicker: "white@0.92",
  headline: "white",
  when: "white",
  where: "white@0.92",
};

/**
 * The ffmpeg arguments (exported for tests). `lines[i]` is drawn from
 * `line<i>.txt`; input is `clip.mp4`, output `out.mp4`, font `font.ttf`, all
 * relative to the job directory.
 */
export function composeArgs(lines: DrawnLine[]): string[] {
  const { width, height } = FRAME;
  const scrimHeight = TEXT_AREA.bottom + 80;
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    "setsar=1",
    // A soft scrim behind the text: two stacked translucent bands, darker at
    // the top, so white text reads on any background the clip has.
    `drawbox=x=0:y=0:w=iw:h=${Math.round(scrimHeight * 0.6)}:color=black@0.22:t=fill`,
    `drawbox=x=0:y=0:w=iw:h=${scrimHeight}:color=black@0.16:t=fill`,
    ...lines.map(
      (l, i) =>
        `drawtext=fontfile=font.ttf:textfile=line${i}.txt:expansion=none:fontsize=${l.size}:fontcolor=${ROLE_COLOR[l.role]}` +
        `:x=(w-text_w)/2:y=${l.y}:shadowcolor=black@0.55:shadowx=3:shadowy=3` +
        // Each line fades in, one after the other.
        `:alpha='if(lt(t,${(0.3 + i * 0.25).toFixed(2)}),0,min(1,(t-${(0.3 + i * 0.25).toFixed(2)})/0.5))'`,
    ),
    "format=yuv420p",
  ];
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "clip.mp4",
    "-vf",
    filters.join(","),
    // Keep the clip's own audio when it has any.
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "out.mp4",
  ];
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function run(args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + String(d)).slice(-2000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

/** Template clip + the host's lines -> MP4 bytes. */
export async function composeTemplateVideo(webOrigin: string, occasion: string, lines: TextLines): Promise<Buffer> {
  const [clipUrl, fallbackUrl] = clipUrls(webOrigin, occasion);
  const clip = (await download(clipUrl)) ?? (await download(fallbackUrl));
  if (!clip) throw new Error(`template clip not found for "${occasion}" (nor the default clip)`);

  const dir = await mkdtemp(join(tmpdir(), "video-invite-"));
  try {
    const drawn = layoutTextLines(lines);
    await writeFile(join(dir, "clip.mp4"), clip);
    await copyFile(FONT_PATH, join(dir, "font.ttf"));
    await Promise.all(drawn.map((l, i) => writeFile(join(dir, `line${i}.txt`), l.text, "utf8")));
    await run(composeArgs(drawn), dir);
    return await readFile(join(dir, "out.mp4"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
