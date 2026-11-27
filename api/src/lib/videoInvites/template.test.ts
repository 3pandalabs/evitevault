import { test } from "node:test";
import assert from "node:assert/strict";
import { clipUrls, composeArgs } from "./compose.js";
import {
  afterFailure,
  cleanTextLines,
  clipFileName,
  fitSize,
  FRAME,
  freeLimitReached,
  FREE_SIMPLE_PER_DAY,
  HARD_MIN_SIZE,
  layoutTextLines,
  priceCents,
  splitInTwo,
  TEXT_AREA,
  textLinesProblem,
} from "./policy.js";

test("simple may be free; pro never is", () => {
  assert.equal(priceCents("simple", "0"), 0);
  assert.equal(priceCents("simple", " "), 300);
  assert.equal(priceCents("simple", undefined), 300);
  assert.equal(priceCents("pro", "0"), 500);
  assert.equal(priceCents("simple", "-5"), 300);
});

test("free daily limit", () => {
  assert.equal(freeLimitReached(FREE_SIMPLE_PER_DAY - 1), false);
  assert.equal(freeLimitReached(FREE_SIMPLE_PER_DAY), true);
});

test("a failed free order needs no refund; a paid one does", () => {
  assert.deepEqual(afterFailure(2, 0), { status: "failed", refundNeeded: false });
  assert.deepEqual(afterFailure(2, 300), { status: "failed", refundNeeded: true });
  assert.deepEqual(afterFailure(1, 0), { status: "paid", refundNeeded: false });
});

test("text lines are cleaned and checked", () => {
  const l = cleanTextLines({ kicker: "  You're\ninvited  to ", headline: "Maya's\u0007 1st Birthday", when: null });
  assert.deepEqual(l, { kicker: "You're invited to", headline: "Maya's 1st Birthday", when: "", where: "" });
  assert.equal(textLinesProblem(l), null);
  assert.equal(textLinesProblem({ ...l, headline: "" }), "headline_required");
  assert.equal(textLinesProblem({ ...l, where: "x".repeat(81) }), "line_too_long");
  assert.equal(textLinesProblem({ ...l, when: "see www.example.com" }), "line_has_link");
});

test("fitSize shrinks to fit, below the preferred minimum only when it must", () => {
  assert.equal(fitSize("Hi", 920, 104, 56), 104);
  const s = fitSize("A long headline that shrinks", 920, 104, 56);
  assert.ok(s < 104 && s >= 56);
  const tight = fitSize("x".repeat(60), 920, 104, 56);
  assert.ok(tight < 56 && 60 * tight * 0.56 <= 920, "fits the frame even below the preferred minimum");
  assert.equal(fitSize("x".repeat(500), 920, 104, 56), HARD_MIN_SIZE);
  assert.ok(80 * HARD_MIN_SIZE * 0.56 <= 920, "longest allowed line fits at the floor");
});

test("splitInTwo balances the halves at a word", () => {
  assert.deepEqual(splitInTwo("Maya & Arjun's Wedding Celebration"), ["Maya & Arjun's", "Wedding Celebration"]);
  assert.deepEqual(splitInTwo("Single"), ["Single", ""]);
});

test("layout stays inside the top text area, in order, wrapped halves share a size", () => {
  const drawn = layoutTextLines({
    kicker: "You're invited to",
    headline: "Maya & Arjun's Wedding Celebration Weekend Extravaganza",
    when: "Saturday, December 12 · 6:30 PM",
    where: "The Grand Pavilion, 123 Main Street, Edison NJ",
  });
  assert.deepEqual(
    drawn.map((d) => d.role),
    ["kicker", "headline", "headline", "when", "where"],
  );
  assert.equal(drawn[1].size, drawn[2].size);
  for (let i = 1; i < drawn.length; i++) assert.ok(drawn[i].y > drawn[i - 1].y);
  assert.ok(drawn[0].y >= TEXT_AREA.top);
  const last = drawn[drawn.length - 1];
  assert.ok(last.y + last.size <= TEXT_AREA.bottom, "text ends inside the top ~40%");
  for (const d of drawn) assert.ok(d.text.length * d.size * 0.56 <= FRAME.width - TEXT_AREA.side * 2 + 1);
});

test("layout skips empty lines", () => {
  const drawn = layoutTextLines({ kicker: "", headline: "Party!", when: "", where: "" });
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].role, "headline");
});

test("ffmpeg args never contain host text: only line<i>.txt files", () => {
  const drawn = layoutTextLines({ kicker: "x", headline: "Evil' :drawtext=text=pwned %{localtime}", when: "", where: "" });
  const args = composeArgs(drawn);
  const graph = args[args.indexOf("-vf") + 1];
  assert.ok(!graph.includes("pwned"));
  assert.ok(!graph.includes("Evil"));
  assert.ok(graph.includes("textfile=line0.txt") && graph.includes("textfile=line1.txt"));
  assert.ok(graph.includes("expansion=none"), "no %{...} expansion of host text");
  assert.ok(args.includes("0:a?"), "keeps the clip's own audio when present");
  assert.equal(args[args.length - 1], "out.mp4");
});

test("clip urls: occasion first, default second", () => {
  assert.deepEqual(clipUrls("https://rsvpvault.3pandalabs.com", "wedding"), [
    "https://rsvpvault.3pandalabs.com/video-invites/clip-wedding.mp4",
    "https://rsvpvault.3pandalabs.com/video-invites/clip-default.mp4",
  ]);
  assert.equal(clipFileName("baby-shower"), "clip-baby-shower.mp4");
});
