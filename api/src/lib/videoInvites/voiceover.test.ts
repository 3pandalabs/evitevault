import { test } from "node:test";
import assert from "node:assert/strict";
import { composeArgs, scrimHeight } from "./compose.js";
import {
  clampVariant,
  clipCandidates,
  cleanScript,
  cleanTextLines,
  defaultNarration,
  layoutTextLines,
  MAX_OUTPUT_S,
  MAX_SCRIPT_CHARS,
  mixPlan,
  nextVariant,
  scriptProblem,
  stripUnsupportedGlyphs,
  ttsCacheKey,
  VARIANT_COUNT,
} from "./policy.js";
import { googleTtsBody, voiceLanguage } from "./ttsRequest.js";

test("variants: 5 per occasion, cycling 1 -> 5 -> 1, clamped", () => {
  assert.equal(VARIANT_COUNT, 5);
  const seen = [1];
  for (let i = 0; i < 5; i++) seen.push(nextVariant(seen[seen.length - 1]));
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 1]);
  assert.equal(clampVariant(0), 1);
  assert.equal(clampVariant(6), 1);
  assert.equal(clampVariant("3"), 3);
  assert.equal(clampVariant(undefined), 1);
  assert.deepEqual(clipCandidates("diwali", 4), ["clip-diwali-4.mp4", "clip-diwali.mp4", "clip-default.mp4"]);
  assert.deepEqual(clipCandidates("diwali", 9), ["clip-diwali-1.mp4", "clip-diwali.mp4", "clip-default.mp4"]);
});

test("narration: prefill from the event, same cap and wording rules as a script", () => {
  const n = defaultNarration({ title: "Maya's 1st Birthday", when: "Saturday, Dec 12", where: "Edison Park" });
  assert.equal(n, "You're invited to Maya's 1st Birthday on Saturday, Dec 12 at Edison Park. Come celebrate with us!");
  assert.equal(defaultNarration({ title: "Party" }), "You're invited to Party. Come celebrate with us!");
  assert.ok(defaultNarration({ title: "x".repeat(300) }).length <= MAX_SCRIPT_CHARS);
  assert.equal(scriptProblem(cleanScript("x".repeat(MAX_SCRIPT_CHARS + 1))), "script_too_long");
  assert.equal(scriptProblem(cleanScript("Come to www.example.com tonight please")), "script_has_link");
  assert.equal(cleanScript("[shouting] Hello everyone, come along!"), "Hello everyone, come along!");
});

test("mix timing: voice at 0.4 s, clip loops to voice end + 0.8 s, never over 15 s", () => {
  assert.deepEqual(mixPlan(8, null), { outSeconds: 8, loopClip: false, voiceDelayMs: 0 });
  assert.deepEqual(mixPlan(8, 5), { outSeconds: 8, loopClip: false, voiceDelayMs: 400 }, "short voice: clip length");
  assert.deepEqual(mixPlan(8, 9), { outSeconds: 10.2, loopClip: true, voiceDelayMs: 400 }, "0.4 + 9 + 0.8");
  assert.equal(mixPlan(8, 30).outSeconds, MAX_OUTPUT_S);
  assert.equal(mixPlan(20, null).outSeconds, MAX_OUTPUT_S, "long clip capped too");
});

test("ffmpeg mix: voice delayed over music ducked -12 dB; voice alone when the clip is silent; loop when needed", () => {
  const lines = layoutTextLines(cleanTextLines({ headline: "Party" }));
  const both = composeArgs({ lines, plan: mixPlan(8, 9), hasVoice: true, clipHasAudio: true });
  const graph = both[both.indexOf("-filter_complex") + 1];
  assert.ok(graph.includes("adelay=400:all=1"));
  assert.ok(graph.includes("volume=-12dB"));
  assert.ok(graph.includes("amix=inputs=2"));
  assert.ok(both.includes("voice.mp3"));
  assert.equal(both[both.indexOf("-stream_loop") + 1], "-1", "clip loops under a long voice");
  assert.equal(both[both.indexOf("-t") + 1], "10.20");

  const silent = composeArgs({ lines, plan: mixPlan(8, 5), hasVoice: true, clipHasAudio: false });
  const g2 = silent[silent.indexOf("-filter_complex") + 1];
  assert.ok(g2.includes("adelay=400") && !g2.includes("amix"));
  assert.ok(!silent.includes("-stream_loop"), "short voice: no loop");
});

test("on-screen text: emoji and undrawable glyphs removed, accents kept", () => {
  assert.equal(stripUnsupportedGlyphs("Maya's party 🎉🎂 at 6!"), "Maya's party at 6!");
  assert.equal(stripUnsupportedGlyphs("👨‍👩‍👧 Family day"), "Family day");
  assert.equal(stripUnsupportedGlyphs("José & Zoë’s wedding – 6:30 PM"), "José & Zoë’s wedding – 6:30 PM");
  assert.equal(stripUnsupportedGlyphs("❤️ love"), "love");
  assert.equal(stripUnsupportedGlyphs("दिवाली Diwali"), "Diwali", "scripts the font can't draw are dropped, never boxes");
  assert.deepEqual(cleanTextLines({ headline: "🎈Party🎈", kicker: "You’re invited ✨" }), {
    kicker: "You’re invited",
    headline: "Party",
    when: "",
    where: "",
  });
});

test("the dark band covers the whole text block", () => {
  const lines = layoutTextLines({
    kicker: "You're invited to",
    headline: "Maya & Arjun's Wedding Celebration Weekend",
    when: "Saturday, December 12 · 6:30 PM",
    where: "The Grand Pavilion, Edison NJ",
  });
  const last = lines[lines.length - 1];
  assert.ok(scrimHeight(lines) >= last.y + last.size, "band reaches below the last line");
  assert.equal(scrimHeight([]), 0);
});

test("text is ~35% larger than before (headline base 140 vs 104)", () => {
  const [kicker, headline] = layoutTextLines({ kicker: "Hi", headline: "Party", when: "", where: "" });
  assert.equal(kicker.size, 62);
  assert.equal(headline.size, 140);
});

test("TTS: Google request uses the one fixed voice; identical lines share one cache key", () => {
  assert.equal(voiceLanguage("en-US-Studio-O"), "en-US");
  assert.equal(voiceLanguage("en-GB-Neural2-A"), "en-GB");
  const body = googleTtsBody("Hello", "en-US-Studio-O");
  assert.deepEqual(body.voice, { languageCode: "en-US", name: "en-US-Studio-O" });
  assert.equal(body.audioConfig.audioEncoding, "MP3");
  const h = (s: string) => `h(${s})`;
  assert.equal(ttsCacheKey("google", "v", "Hi", h), ttsCacheKey("google", "v", "Hi", h));
  assert.notEqual(ttsCacheKey("google", "v", "Hi", h), ttsCacheKey("fal", "v", "Hi", h));
});
