import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  clipCandidates,
  FRAME,
  layoutTextLines,
  mixPlan,
  MUSIC_UNDER_VOICE_DB,
  type DrawnLine,
  type MixPlan,
  type TextLines,
} from "./policy.js";

// Simple video invites: one of the occasion's pre-made, non-talking panda
// clips (variant 1..5; pandas in the lower half, clean background in the top
// ~40%) with the host's text drawn into the top area by ffmpeg, and an
// optional narrator voiceover (lib/videoInvites/tts.ts) mixed over the clip's
// own music, which is ducked to about -12 dB. Runs in the API container
// (ffmpeg + ffprobe from api/Dockerfile), takes seconds.
//
// SAFETY: host text never enters the filter graph. Each line is written to its
// own file in a fresh temp directory and drawn with drawtext `textfile=` and
// `expansion=none`; the graph only ever names those files and the bundled
// font, and ffmpeg runs with that directory as its cwd so every path is a
// plain relative name. The arguments go to spawn() as an array, never through
// a shell.

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

/** Clip URLs to try for an occasion + variant (variant, then the occasion's, then the default). */
export function clipUrls(webOrigin: string, occasion: string, variant = 1): string[] {
  return clipCandidates(occasion, variant).map((f) => `${webOrigin}/video-invites/${f}`);
}

const ROLE_COLOR: Record<keyof TextLines, string> = {
  kicker: "white@0.92",
  headline: "white",
  when: "white",
  where: "white@0.92",
};

/**
 * Height of the dark band behind the text: always below the LAST line drawn
 * (plus a soft margin), so the band covers the whole text block however the
 * layout wrapped or shrank it.
 */
export function scrimHeight(lines: DrawnLine[]): number {
  if (lines.length === 0) return 0;
  const last = lines[lines.length - 1];
  return Math.min(FRAME.height, last.y + Math.round(last.size * 1.25) + 70);
}

export type ComposeInputs = {
  lines: DrawnLine[];
  plan: MixPlan;
  /** A narrator file (voice.mp3) is in the job dir. */
  hasVoice: boolean;
  /** The clip has its own audio track. */
  clipHasAudio: boolean;
};

/**
 * The ffmpeg arguments (exported for tests). `lines[i]` is drawn from
 * `line<i>.txt`; inputs are `clip.mp4` (+ `voice.mp3`), output `out.mp4`,
 * font `font.ttf`, all relative to the job directory.
 */
export function composeArgs({ lines, plan, hasVoice, clipHasAudio }: ComposeInputs): string[] {
  const { width, height } = FRAME;
  const band = scrimHeight(lines);
  const video = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    "setsar=1",
    // A soft scrim behind the text: a darker band over the text block and a
    // lighter one a little below it, so white text reads on any background.
    ...(band
      ? [
          `drawbox=x=0:y=0:w=iw:h=${band}:color=black@0.30:t=fill`,
          `drawbox=x=0:y=${band}:w=iw:h=60:color=black@0.12:t=fill`,
        ]
      : []),
    ...lines.map(
      (l, i) =>
        `drawtext=fontfile=font.ttf:textfile=line${i}.txt:expansion=none:fontsize=${l.size}:fontcolor=${ROLE_COLOR[l.role]}` +
        `:x=(w-text_w)/2:y=${l.y}:shadowcolor=black@0.6:shadowx=3:shadowy=3` +
        // Each line fades in, one after the other.
        `:alpha='if(lt(t,${(0.3 + i * 0.25).toFixed(2)}),0,min(1,(t-${(0.3 + i * 0.25).toFixed(2)})/0.5))'`,
    ),
    "format=yuv420p",
  ].join(",");

  const inputs = [
    // Loop the clip when the voice runs past its end (the -t below cuts it).
    ...(plan.loopClip ? ["-stream_loop", "-1"] : []),
    "-i",
    "clip.mp4",
    ...(hasVoice ? ["-i", "voice.mp3"] : []),
  ];

  // Audio: the voice (delayed) over the clip's music (ducked); the voice
  // alone when the clip is silent; the clip's own audio when there's no voice.
  let audioGraph: string | null = null;
  let audioMap: string[];
  if (hasVoice && clipHasAudio) {
    audioGraph =
      `[1:a]adelay=${plan.voiceDelayMs}:all=1,aresample=48000[v];` +
      `[0:a]volume=${MUSIC_UNDER_VOICE_DB}dB,aresample=48000[m];` +
      "[m][v]amix=inputs=2:duration=longest:normalize=0[a]";
    audioMap = ["-map", "[a]"];
  } else if (hasVoice) {
    audioGraph = `[1:a]adelay=${plan.voiceDelayMs}:all=1,aresample=48000,apad[a]`;
    audioMap = ["-map", "[a]"];
  } else {
    audioMap = ["-map", "0:a?"];
  }

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    `[0:v]${video}[vout]${audioGraph ? `;${audioGraph}` : ""}`,
    "-map",
    "[vout]",
    ...audioMap,
    "-t",
    plan.outSeconds.toFixed(2),
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

function run(cmd: "ffmpeg" | "ffprobe", args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
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
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

/** Duration (s) and whether a file has an audio stream, via ffprobe. */
async function probe(file: string, cwd: string): Promise<{ seconds: number; hasAudio: boolean }> {
  const out = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file],
    cwd,
  );
  const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  return {
    seconds: Number(j.format?.duration ?? 0) || 0,
    hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio"),
  };
}

/** Template clip (variant) + the host's lines (+ narrator) -> MP4 bytes. */
export async function composeTemplateVideo(
  webOrigin: string,
  occasion: string,
  lines: TextLines,
  opts: { variant?: number; voice?: Buffer | null } = {},
): Promise<Buffer> {
  let clip: Buffer | null = null;
  for (const url of clipUrls(webOrigin, occasion, opts.variant ?? 1)) {
    clip = await download(url);
    if (clip) break;
  }
  if (!clip) throw new Error(`template clip not found for "${occasion}" (nor the default clip)`);

  const dir = await mkdtemp(join(tmpdir(), "video-invite-"));
  try {
    const drawn = layoutTextLines(lines);
    await writeFile(join(dir, "clip.mp4"), clip);
    await copyFile(FONT_PATH, join(dir, "font.ttf"));
    await Promise.all(drawn.map((l, i) => writeFile(join(dir, `line${i}.txt`), l.text, "utf8")));
    const clipInfo = await probe("clip.mp4", dir);
    let voiceSeconds: number | null = null;
    if (opts.voice) {
      await writeFile(join(dir, "voice.mp3"), opts.voice);
      voiceSeconds = (await probe("voice.mp3", dir)).seconds || null;
    }
    const plan = mixPlan(clipInfo.seconds, voiceSeconds);
    await run(
      "ffmpeg",
      composeArgs({ lines: drawn, plan, hasVoice: voiceSeconds !== null, clipHasAudio: clipInfo.hasAudio }),
      dir,
    );
    return await readFile(join(dir, "out.mp4"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
