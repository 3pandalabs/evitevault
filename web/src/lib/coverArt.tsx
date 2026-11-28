"use client";

import { useId } from "react";

/**
 * Built-in cover artwork.
 *
 * Drawn as SVG in the invitation's own palette rather than shipped as photos:
 * a stock photograph needs a licence, a CDN and an asset per template, and it
 * fights whatever colours the host picked. A pattern built from the palette
 * can't clash, weighs a couple of kilobytes, and scales to any hero size.
 *
 * The names mirror the allowlist the API validates against
 * (`COVER_ART` in api/src/lib/theme.ts) — a theme naming something not in this
 * map renders `plain` rather than an empty banner.
 *
 * A host who wants their own photograph uploads one; that always wins, and the
 * artwork is what fills the space until they do.
 */
export const ART_LABELS: Record<string, string> = {
  plain: "Plain",
  marigold: "Marigold",
  diyas: "Diyas",
  mandala: "Mandala",
  rings: "Rings",
  petals: "Petals",
  stars: "Stars",
  confetti: "Confetti",
  balloons: "Balloons",
  home: "New home",
  palms: "Palms",
  stripes: "Stripes",
  pumpkins: "Pumpkins",
  turkey: "Turkey",
  "happy-turkey": "Happy turkey",
  pine: "Pine trees",
  snowflakes: "Snowflakes",
  // Muse-generated set (2026), one per occasion.
  "arched-florals": "Arched florals",
  "confetti-arcs": "Confetti arcs",
  "autumn-harvest": "Autumn harvest",
  "pine-berry": "Pine & berry",
  sunburst: "Sunburst",
  "balloon-cluster": "Balloon cluster",
  "tiered-cake": "Tiered cake",
  "diya-marigold": "Diya & marigold",
  "house-key": "House & key",
  "cocktail-coupe": "Cocktail coupe",
  "single-stem": "Single stem",
  // Muse premium batch (2026), one per style.
  "deco-fan": "Deco fan",
  "pattern-band": "Pattern band",
  "mono-rule": "Mono rule",
  "wash-blooms": "Wash blooms",
  "starburst-boomerang": "Atomic starburst",
  "foil-laurel": "Foil laurel",
  "sketch-wreath": "Sketch wreath",
  "bauhaus-shapes": "Bauhaus shapes",
};

export const ART_CHOICES = Object.keys(ART_LABELS);

export type ArtPalette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
};

/**
 * Renders as a background layer: it fills its container and is decorative, so
 * it is hidden from assistive technology entirely — every word on the
 * invitation is in the DOM already.
 *
 * Pattern ids are per-instance (useId) because the picker paints two dozen of
 * these on one page, and duplicate ids in SVG defs make every instance render
 * whichever definition loaded last.
 */
export function CoverArt({
  art,
  palette,
  className,
}: {
  art: string;
  palette: ArtPalette;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const draw = ARTWORK[art] ?? ARTWORK.plain;

  return (
    <svg
      className={className}
      viewBox="0 0 800 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <rect width="800" height="300" fill={palette.bg} />
      {draw(id, palette)}
    </svg>
  );
}

type Draw = (id: string, p: ArtPalette) => React.ReactNode;

// Each pattern paints over a plain background rect, so every one of these is
// free to be sparse — the palette's own bg carries the rest.
const ARTWORK: Record<string, Draw> = {
  // Two soft washes of accent. The default, and what a template gets when it
  // names artwork this file doesn't have.
  plain: (id, p) => (
    <>
      <defs>
        <radialGradient id={`${id}-g`} cx="20%" cy="10%" r="80%">
          <stop offset="0%" stopColor={p.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={p.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-g)`} />
      <circle cx="700" cy="270" r="180" fill={p.accent} opacity="0.1" />
      <circle cx="120" cy="290" r="120" fill={p.muted} opacity="0.12" />
    </>
  ),

  // Layered petals on a stem — the strung marigold garland of an Indian
  // wedding or puja, tiled.
  marigold: (id, p) => (
    <>
      <defs>
        <pattern id={`${id}-p`} width="100" height="100" patternUnits="userSpaceOnUse">
          <g opacity="0.55">
            {[0, 45, 90, 135].map((a) => (
              <ellipse
                key={a}
                cx="50"
                cy="50"
                rx="30"
                ry="12"
                fill={p.accent}
                opacity="0.5"
                transform={`rotate(${a} 50 50)`}
              />
            ))}
            <circle cx="50" cy="50" r="10" fill={p.accent} />
            <circle cx="0" cy="0" r="6" fill={p.muted} opacity="0.6" />
            <circle cx="100" cy="100" r="6" fill={p.muted} opacity="0.6" />
          </g>
        </pattern>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-p)`} opacity="0.5" />
    </>
  ),

  // A row of oil lamps with flames — Diwali.
  diyas: (id, p) => (
    <>
      <rect y="215" width="800" height="85" fill={p.accent} opacity="0.12" />
      {[80, 240, 400, 560, 720].map((x, i) => (
        <g key={x} transform={`translate(${x} ${190 + (i % 2) * 14})`}>
          <path d="M-34 12 Q0 44 34 12 Z" fill={p.accent} opacity="0.85" />
          <ellipse cx="0" cy="12" rx="34" ry="7" fill={p.accent} />
          <path d="M0 -26 Q11 -8 0 4 Q-11 -8 0 -26 Z" fill={p.accentText} opacity="0.9" />
          <path d="M0 -16 Q5 -6 0 0 Q-5 -6 0 -16 Z" fill={p.accent} opacity="0.7" />
        </g>
      ))}
      {[140, 330, 520, 680].map((x, i) => (
        <circle key={x} cx={x} cy={50 + (i % 3) * 26} r="3.5" fill={p.accent} opacity="0.5" />
      ))}
    </>
  ),

  // Concentric rings of petals — the rangoli/mandala motif, cropped by the
  // frame so it reads as a corner ornament rather than a logo.
  mandala: (id, p) => (
    <>
      {[0, 1].map((k) => (
        <g key={k} transform={k === 0 ? "translate(70 40)" : "translate(730 260)"}>
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <ellipse
              key={a}
              rx="120"
              ry="34"
              fill="none"
              stroke={p.accent}
              strokeWidth="1.5"
              opacity="0.35"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r="60" fill="none" stroke={p.accent} strokeWidth="1.5" opacity="0.45" />
          <circle r="26" fill={p.accent} opacity="0.3" />
        </g>
      ))}
    </>
  ),

  // Interlocking bands, scattered and overlapping — weddings.
  rings: (id, p) => (
    <>
      {[
        [130, 90, 62],
        [196, 118, 62],
        [610, 210, 74],
        [688, 176, 74],
        [400, 40, 40],
        [446, 62, 40],
      ].map(([cx, cy, r], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={p.accent}
          strokeWidth="4"
          opacity={i % 2 ? 0.3 : 0.45}
        />
      ))}
      <circle cx="300" cy="250" r="8" fill={p.muted} opacity="0.5" />
      <circle cx="540" cy="70" r="6" fill={p.muted} opacity="0.5" />
    </>
  ),

  // Falling leaves — gardens, mehendi mornings, brunches.
  petals: (id, p) => (
    <>
      <defs>
        <pattern id={`${id}-p`} width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M20 60 Q50 20 80 60 Q50 100 20 60 Z" fill={p.accent} opacity="0.28" />
          <path
            d="M70 15 Q95 0 110 30 Q80 45 70 15 Z"
            fill={p.muted}
            opacity="0.3"
          />
          <path d="M20 60 Q50 60 80 60" stroke={p.bg} strokeWidth="1.5" fill="none" opacity="0.8" />
        </pattern>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-p)`} />
    </>
  ),

  // Four-point sparkles at three sizes — evenings, milestones, naming days.
  stars: (id, p) => {
    const star = (x: number, y: number, s: number, o: number, k: string) => (
      <path
        key={k}
        d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${
          y + s * 0.18
        } ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${
          y - s * 0.18
        } ${x} ${y - s} Z`}
        fill={p.accent}
        opacity={o}
      />
    );
    const pts: [number, number, number, number][] = [
      [90, 70, 26, 0.7],
      [240, 40, 14, 0.5],
      [180, 190, 18, 0.45],
      [420, 90, 30, 0.6],
      [560, 200, 16, 0.5],
      [660, 60, 24, 0.65],
      [740, 220, 12, 0.45],
      [330, 250, 14, 0.4],
      [500, 20, 10, 0.4],
    ];
    return <>{pts.map(([x, y, s, o], i) => star(x, y, s, o, String(i)))}</>;
  },

  // Scattered rectangles at angles — birthdays and anything loud.
  confetti: (id, p) => {
    const colours = [p.accent, p.muted, p.text];
    const pieces = Array.from({ length: 46 }, (_, i) => {
      // Deterministic pseudo-random: a fixed layout that looks scattered but
      // renders identically on server and client. Math.random() here would be
      // a hydration mismatch on every load.
      const x = (i * 137.5) % 800;
      const y = (i * 91.7) % 300;
      const rot = (i * 47) % 180;
      return (
        <rect
          key={i}
          x={x}
          y={y}
          width={i % 3 === 0 ? 6 : 10}
          height={i % 3 === 0 ? 16 : 6}
          rx="2"
          fill={colours[i % colours.length]}
          opacity={0.25 + ((i * 13) % 40) / 100}
          transform={`rotate(${rot} ${x} ${y})`}
        />
      );
    });
    return <>{pieces}</>;
  },

  // Balloons on strings, rising out of the bottom edge — kids' parties.
  balloons: (id, p) => (
    <>
      {[
        [110, 150, 44],
        [230, 200, 34],
        [610, 165, 40],
        [710, 210, 30],
        [420, 235, 26],
      ].map(([cx, cy, r], i) => (
        <g key={i} opacity={i % 2 ? 0.55 : 0.75}>
          <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.18} fill={i % 2 ? p.muted : p.accent} />
          <path
            d={`M${cx} ${cy + r * 1.18} q${i % 2 ? 18 : -18} 50 0 ${300 - cy}`}
            stroke={p.muted}
            strokeWidth="2"
            fill="none"
            opacity="0.6"
          />
        </g>
      ))}
    </>
  ),

  // A skyline of little roofs — housewarmings.
  home: (id, p) => (
    <>
      <defs>
        <pattern id={`${id}-p`} width="140" height="140" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={p.accent} strokeWidth="2.5" opacity="0.35">
            <path d="M30 80 L60 52 L90 80" />
            <path d="M38 80 L38 108 L82 108 L82 80" />
            <rect x="54" y="88" width="12" height="20" />
          </g>
        </pattern>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-p)`} />
      <rect y="270" width="800" height="30" fill={p.accent} opacity="0.15" />
    </>
  ),

  // Fronds arching in from the corners — pool parties, terraces.
  palms: (id, p) => {
    const frond = (x: number, y: number, rot: number, k: string) => (
      <g key={k} transform={`translate(${x} ${y}) rotate(${rot})`} opacity="0.4">
        <path d="M0 0 Q80 -20 160 0 Q80 20 0 0 Z" fill={p.accent} />
        {[30, 60, 90, 120].map((o) => (
          <path key={o} d={`M${o} -12 L${o} 12`} stroke={p.bg} strokeWidth="2" opacity="0.7" />
        ))}
      </g>
    );
    return (
      <>
        {frond(-20, 40, 20, "a")}
        {frond(-10, 250, -25, "b")}
        {frond(820, 60, 160, "c")}
        {frond(810, 240, 200, "d")}
      </>
    );
  },

  // A lush pumpkin patch under a scatter of autumn leaves — Thanksgiving.
  // Composed to fill the centre of a tall arch: the frame crops to its middle
  // band, so everything lives between x≈180–620, leaves up top and pumpkins
  // massed along the base, nothing stranded at the sides.
  pumpkins: (id, p) => {
    const leaf = (x: number, y: number, s: number, rot: number, fill: string, o: number, k: string) => (
      <path
        key={k}
        d={`M0 ${s} Q${-s * 0.7} 0 0 ${-s} Q${s * 0.7} 0 0 ${s} Z`}
        transform={`translate(${x} ${y}) rotate(${rot})`}
        fill={fill}
        opacity={o}
      />
    );
    const pumpkin = (cx: number, cy: number, r: number, fill: string, o: number, k: string) => (
      <g key={k} opacity={o}>
        <ellipse cx={cx - r * 0.5} cy={cy} rx={r * 0.45} ry={r * 0.82} fill={fill} />
        <ellipse cx={cx + r * 0.5} cy={cy} rx={r * 0.45} ry={r * 0.82} fill={fill} />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.84} fill={fill} />
        <path d={`M${cx} ${cy - r * 0.7} Q${cx - r * 0.45} ${cy} ${cx} ${cy + r * 0.7}`} stroke={p.bg} strokeWidth="2" fill="none" opacity="0.4" />
        <path d={`M${cx} ${cy - r * 0.7} Q${cx + r * 0.45} ${cy} ${cx} ${cy + r * 0.7}`} stroke={p.bg} strokeWidth="2" fill="none" opacity="0.4" />
        <path d={`M${cx} ${cy - r * 0.84} q-3 -14 9 -18`} stroke={p.text} strokeWidth="5" fill="none" opacity="0.55" strokeLinecap="round" />
      </g>
    );
    return (
      <>
        {leaf(250, 70, 22, 25, p.accent, 0.5, "l1")}
        {leaf(330, 42, 17, -35, p.muted, 0.45, "l2")}
        {leaf(405, 85, 24, 65, p.muted, 0.4, "l3")}
        {leaf(475, 48, 19, -18, p.accent, 0.55, "l4")}
        {leaf(545, 96, 16, 42, p.muted, 0.4, "l5")}
        {leaf(300, 150, 15, 85, p.accent, 0.4, "l6")}
        {leaf(530, 158, 17, -55, p.accent, 0.4, "l7")}
        {leaf(400, 126, 13, 10, p.muted, 0.35, "l8")}
        {pumpkin(330, 242, 50, p.muted, 0.7, "p1")}
        {pumpkin(474, 250, 62, p.accent, 0.9, "p2")}
        {pumpkin(406, 228, 40, p.accent, 0.8, "p3")}
        {pumpkin(286, 264, 30, p.accent, 0.6, "p4")}
        {pumpkin(542, 260, 34, p.muted, 0.6, "p5")}
      </>
    );
  },

  // A turkey with a full fanned tail, centred and filling the frame top to
  // bottom, a leaf tucked at each side — Thanksgiving dinner.
  turkey: (id, p) => {
    const feather = (angle: number, len: number, rx: number, fill: string, o: number, k: string) => (
      <ellipse
        key={k}
        cx="0"
        cy={-len}
        rx={rx}
        ry={len * 0.9}
        fill={fill}
        opacity={o}
        transform={`rotate(${angle} 0 0)`}
      />
    );
    const outer = [-80, -60, -40, -20, 0, 20, 40, 60, 80];
    const inner = [-64, -43, -21, 0, 21, 43, 64];
    return (
      <>
        <g transform="translate(400 258)">
          {outer.map((a, i) => feather(a, 120, 21, i % 2 ? p.muted : p.accent, 0.5, `o${i}`))}
          {inner.map((a, i) => feather(a, 88, 18, i % 2 ? p.accent : p.muted, 0.7, `i${i}`))}
          {/* body */}
          <ellipse cx="0" cy="-4" rx="60" ry="52" fill={p.accent} />
          {/* wing line */}
          <path d="M-44 -10 Q0 26 44 -10" stroke={p.bg} strokeWidth="2.5" fill="none" opacity="0.35" />
          {/* neck + head */}
          <path d="M-8 -46 q-20 -16 -10 -44" stroke={p.accent} strokeWidth="20" fill="none" strokeLinecap="round" />
          <circle cx="-18" cy="-92" r="16" fill={p.accent} />
          {/* beak */}
          <path d="M-33 -92 l-18 4 l16 9 z" fill={p.muted} />
          {/* wattle */}
          <path d="M-22 -80 q-5 14 2 20" stroke={p.muted} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.85" />
          {/* feet */}
          <path d="M-16 46 l0 16 M16 46 l0 16" stroke={p.muted} strokeWidth="5" strokeLinecap="round" opacity="0.6" />
        </g>
        <path d="M232 92 Q216 72 232 52 Q248 72 232 92 Z" fill={p.muted} opacity="0.4" />
        <path d="M566 112 Q550 92 566 72 Q582 92 566 112 Z" fill={p.accent} opacity="0.4" />
      </>
    );
  },

  // A cartoon turkey in a pilgrim hat. The one piece of built-in art that is a
  // picture rather than a palette pattern: it's drawn in fixed autumn colours so
  // it reads the same warm scene on any card (the palette bg still shows behind
  // it). Centred and full-height to fill an arch; flat shapes only, so it
  // rasterises cleanly for the card export.
  "happy-turkey": () => {
    const fan = ["#e07b1e", "#f0a63a", "#c0371f", "#d9632a", "#7a8a3e", "#f0a63a", "#c0371f", "#d9632a", "#f0a63a", "#e07b1e", "#c0371f"];
    const angles = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    return (
      <>
        <g transform="translate(400 214)">
          {angles.map((a, i) => (
            <g key={a} transform={`rotate(${a})`}>
              <ellipse cx="0" cy="-116" rx="25" ry="76" fill={fan[i]} />
              <ellipse cx="0" cy="-120" rx="11" ry="48" fill="#ffffff" opacity="0.18" />
            </g>
          ))}
        </g>
        {/* body */}
        <ellipse cx="338" cy="228" rx="20" ry="34" fill="#9c571f" />
        <ellipse cx="462" cy="228" rx="20" ry="34" fill="#9c571f" />
        <ellipse cx="400" cy="228" rx="74" ry="66" fill="#b86a2a" />
        <ellipse cx="400" cy="240" rx="50" ry="48" fill="#e3a05a" />
        {/* head */}
        <circle cx="400" cy="150" r="50" fill="#cc7a33" />
        <circle cx="364" cy="168" r="10" fill="#e8896a" opacity="0.55" />
        <circle cx="436" cy="168" r="10" fill="#e8896a" opacity="0.55" />
        {/* eyes */}
        <ellipse cx="382" cy="150" rx="16" ry="18" fill="#ffffff" />
        <ellipse cx="418" cy="150" rx="16" ry="18" fill="#ffffff" />
        <circle cx="386" cy="153" r="9" fill="#2a1a10" />
        <circle cx="414" cy="153" r="9" fill="#2a1a10" />
        <circle cx="389" cy="150" r="3" fill="#ffffff" />
        <circle cx="417" cy="150" r="3" fill="#ffffff" />
        {/* beak + wattle */}
        <path d="M386 166 L414 166 L400 185 Z" fill="#f2a93b" />
        <path d="M404 180 q12 14 3 30 q-11 -3 -9 -22 z" fill="#d6372a" />
        {/* pilgrim hat */}
        <ellipse cx="400" cy="116" rx="78" ry="13" fill="#2a221d" />
        <path d="M360 116 L368 72 Q400 64 432 72 L440 116 Z" fill="#332a24" />
        <rect x="360" y="98" width="80" height="14" fill="#5a4636" />
        <rect x="391" y="97" width="18" height="16" rx="2" fill="none" stroke="#e0b23c" strokeWidth="4" />
        {/* leaves + berries at the base */}
        <path d="M250 278 Q234 258 250 240 Q266 258 250 278 Z" fill="#d9632a" opacity="0.85" />
        <path d="M550 276 Q534 256 550 238 Q566 256 550 276 Z" fill="#e07b1e" opacity="0.85" />
        <circle cx="300" cy="286" r="6" fill="#c0371f" opacity="0.85" />
        <circle cx="315" cy="290" r="5" fill="#d6372a" opacity="0.85" />
        <circle cx="500" cy="288" r="6" fill="#c0371f" opacity="0.85" />
        <circle cx="486" cy="291" r="5" fill="#d6372a" opacity="0.85" />
      </>
    );
  },

  // A stand of pines under falling snow, filling the frame — Christmas, winter.
  pine: (id, p) => {
    const tree = (x: number, baseY: number, s: number, o: number, k: string) => (
      <g key={k} opacity={o} fill={p.accent}>
        <path d={`M${x} ${baseY - s} L${x - s * 0.32} ${baseY - s * 0.58} L${x + s * 0.32} ${baseY - s * 0.58} Z`} />
        <path d={`M${x} ${baseY - s * 0.74} L${x - s * 0.44} ${baseY - s * 0.3} L${x + s * 0.44} ${baseY - s * 0.3} Z`} />
        <path d={`M${x} ${baseY - s * 0.46} L${x - s * 0.56} ${baseY} L${x + s * 0.56} ${baseY} Z`} />
        <rect x={x - 4} y={baseY} width="8" height="14" fill={p.text} opacity="0.4" />
      </g>
    );
    const snow = (x: number, y: number, r: number, o: number, k: string) => (
      <circle key={k} cx={x} cy={y} r={r} fill={p.text} opacity={o} />
    );
    return (
      <>
        <rect y="266" width="800" height="34" fill={p.text} opacity="0.08" />
        {tree(400, 258, 232, 0.72, "t1")}
        {tree(300, 264, 168, 0.5, "t2")}
        {tree(500, 262, 176, 0.52, "t3")}
        {tree(238, 268, 118, 0.4, "t4")}
        {tree(560, 268, 126, 0.4, "t5")}
        {(
          [
            [252, 60, 4],
            [330, 108, 3],
            [408, 48, 5],
            [470, 92, 3],
            [540, 66, 4],
            [300, 168, 3],
            [520, 160, 4],
            [382, 140, 3],
            [596, 118, 3],
            [224, 118, 3],
          ] as [number, number, number][]
        ).map(([x, y, r], i) => snow(x, y, r, 0.5, `s${i}`))}
      </>
    );
  },

  // Six-armed snowflakes scattered — Christmas, winter whites.
  snowflakes: (id, p) => {
    const flake = (x: number, y: number, s: number, o: number, k: string) => (
      <g
        key={k}
        transform={`translate(${x} ${y})`}
        stroke={p.accent}
        strokeWidth={Math.max(1.2, s * 0.06)}
        opacity={o}
        fill="none"
        strokeLinecap="round"
      >
        {[0, 60, 120].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <line x1={-s} y1="0" x2={s} y2="0" />
            <path
              d={`M${s * 0.55} 0 l${s * 0.22} ${-s * 0.2} M${s * 0.55} 0 l${s * 0.22} ${s * 0.2} M${-s * 0.55} 0 l${-s * 0.22} ${-s * 0.2} M${-s * 0.55} 0 l${-s * 0.22} ${s * 0.2}`}
            />
          </g>
        ))}
      </g>
    );
    const pts: [number, number, number, number][] = [
      [100, 80, 28, 0.6],
      [260, 200, 18, 0.45],
      [430, 70, 32, 0.55],
      [560, 210, 20, 0.5],
      [680, 90, 24, 0.6],
      [740, 230, 14, 0.4],
      [330, 250, 16, 0.4],
      [180, 150, 12, 0.4],
    ];
    return <>{pts.map(([x, y, s, o], i) => flake(x, y, s, o, String(i)))}</>;
  },

  // --- Muse-generated set (2026) — one motif per occasion -----------------
  // All palette-driven, centred/crop-safe for the arch, flat shapes only.

  // A central floral spray filling the arch — weddings. Centred and bold so it
  // survives the arch crop rather than stranding a garland above the opening.
  "arched-florals": (id, p) => {
    const bloom = (cx: number, cy: number, r: number, k: string) => (
      <g key={k}>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx={cx} cy={cy - r} rx={r * 0.5} ry={r} fill={p.accent} opacity="0.55" transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.5} fill={p.accent} opacity="0.9" />
        <circle cx={cx} cy={cy} r={r * 0.22} fill={p.bg} />
      </g>
    );
    const leaf = (x: number, y: number, s: number, rot: number, k: string) => (
      <path key={k} d="M0 18 Q-12 0 0 -18 Q12 0 0 18 Z" transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} fill={p.muted} opacity="0.5" />
    );
    return (
      <>
        <path d="M400 292 Q392 200 400 120" stroke={p.muted} strokeWidth="2.5" fill="none" opacity="0.5" />
        <path d="M400 250 Q348 210 328 150" stroke={p.muted} strokeWidth="2" fill="none" opacity="0.45" />
        <path d="M400 250 Q452 210 472 150" stroke={p.muted} strokeWidth="2" fill="none" opacity="0.45" />
        {leaf(356, 212, 1, 42, "la")}
        {leaf(444, 210, 1, -42, "lb")}
        {leaf(378, 162, 0.8, 72, "lc")}
        {leaf(422, 160, 0.8, -72, "ld")}
        {bloom(330, 140, 24, "b2")}
        {bloom(470, 140, 24, "b3")}
        {bloom(400, 108, 36, "b1")}
      </>
    );
  },

  // Three sweeping arcs of confetti across the top — New Year, celebrations.
  "confetti-arcs": (id, p) => {
    const cols = [p.accent, p.muted, p.text];
    return (
      <>
        {[70, 100, 130].map((ry, a) => (
          <path key={a} d={`M150 ${44 + a * 26} Q400 ${44 + a * 26 - ry} 650 ${44 + a * 26}`} fill="none" stroke={cols[a]} strokeWidth="2" opacity="0.35" />
        ))}
        {Array.from({ length: 34 }, (_, i) => {
          const x = 185 + ((i * 53) % 430);
          const y = 30 + ((i * 37) % 150);
          const rot = (i * 51) % 180;
          return <rect key={i} x={x} y={y} width={i % 3 ? 9 : 5} height={i % 3 ? 5 : 13} rx="1.5" fill={cols[i % 3]} opacity={0.3 + ((i * 11) % 40) / 100} transform={`rotate(${rot} ${x} ${y})`} />;
        })}
      </>
    );
  },

  // Falling leaves above, wheat and a pumpkin cluster below — Thanksgiving.
  // Leaves fill the upper arch so it isn't empty over the harvest.
  "autumn-harvest": (id, p) => {
    const leaf = (x: number, y: number, s: number, rot: number, fill: string, k: string) => (
      <path key={k} d="M0 16 Q-11 0 0 -16 Q11 0 0 16 Z" transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} fill={fill} opacity="0.6" />
    );
    return (
      <>
        {leaf(300, 80, 1.1, 30, p.accent, "l1")}
        {leaf(380, 56, 0.9, -30, p.muted, "l2")}
        {leaf(452, 86, 1.1, 60, p.muted, "l3")}
        {leaf(512, 64, 0.9, -20, p.accent, "l4")}
        {leaf(340, 132, 0.8, 80, p.accent, "l5")}
        {leaf(470, 134, 0.8, -60, p.muted, "l6")}
        {[322, 478].map((x, i) => (
          <g key={i} stroke={p.muted} strokeWidth="2.5" fill="none" opacity="0.6">
            <path d={`M${x} 290 L${x} 190`} />
            {[0, 1, 2, 3].map((j) => (
              <g key={j}>
                <path d={`M${x} ${204 + j * 18} q15 -6 21 -19`} />
                <path d={`M${x} ${204 + j * 18} q-15 -6 -21 -19`} />
              </g>
            ))}
          </g>
        ))}
        <ellipse cx="366" cy="266" rx="36" ry="30" fill={p.muted} opacity="0.7" />
        <ellipse cx="420" cy="270" rx="46" ry="38" fill={p.accent} opacity="0.9" />
        <path d="M420 234 q-3 -12 9 -16" stroke={p.text} strokeWidth="4" fill="none" opacity="0.5" strokeLinecap="round" />
      </>
    );
  },

  // Two full pine sprigs brought inward, berries and a bold star — Christmas.
  "pine-berry": (id, p) => {
    const sprig = (x: number, dir: number, k: string) => (
      <g key={k} stroke={p.accent} strokeWidth="3" fill="none" opacity="0.6">
        <path d={`M${x} 68 q${dir * 50} 50 ${dir * 34} 150`} />
        {[0, 1, 2, 3, 4, 5].map((j) => {
          const bx = x + dir * (4 + j * 8);
          const by = 84 + j * 26;
          return <g key={j}><path d={`M${bx} ${by} l${dir * 26} -13`} /><path d={`M${bx} ${by} l${dir * 26} 13`} /></g>;
        })}
      </g>
    );
    return (
      <>
        {sprig(272, 1, "l")}
        {sprig(528, -1, "r")}
        {([[292, 150], [306, 184], [340, 124], [528, 150], [514, 184], [480, 124], [400, 252], [378, 242], [422, 242]] as [number, number][]).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="7" fill={p.accent} opacity="0.85" />
        ))}
        <path d="M400 52 l7 18 19 1 -15 13 6 18 -17 -10 -17 10 6 -18 -15 -13 19 -1 z" fill={p.accent} opacity="0.8" />
      </>
    );
  },

  // A rising sun of alternating rays with a centre disc — corporate, modern.
  sunburst: (id, p) => (
    <g transform="translate(400 300)">
      {Array.from({ length: 25 }, (_, i) => {
        const rad = ((180 + (i / 24) * 180) * Math.PI) / 180;
        const len = i % 2 ? 160 : 118;
        return (
          <line
            key={i}
            x1={Math.cos(rad) * 68}
            y1={Math.sin(rad) * 68}
            x2={Math.cos(rad) * (68 + len)}
            y2={Math.sin(rad) * (68 + len)}
            stroke={p.accent}
            strokeWidth="3"
            opacity="0.4"
          />
        );
      })}
      <circle r="58" fill="none" stroke={p.accent} strokeWidth="3" opacity="0.6" />
    </g>
  ),

  // Five overlapping balloons in a cluster with trailing strings — baby, parties.
  "balloon-cluster": (id, p) => (
    <>
      {([[360, 92, 34], [422, 78, 40], [400, 132, 30], [338, 142, 26], [462, 128, 28]] as [number, number, number][]).map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={i % 2 ? p.muted : p.accent} opacity={i % 2 ? 0.5 : 0.7} />
          <path d={`M${x} ${y + r} q${i % 2 ? 10 : -10} 60 ${i % 2 ? 4 : -4} ${300 - y - r}`} stroke={p.muted} strokeWidth="1.5" fill="none" opacity="0.4" />
        </g>
      ))}
    </>
  ),

  // A two-tier cake with candles under a scatter of dots — birthdays.
  "tiered-cake": (id, p) => (
    <>
      {([[244, 120], [560, 110], [284, 70], [520, 80], [400, 48]] as [number, number][]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 4 : 6} fill={p.muted} opacity="0.5" />
      ))}
      <ellipse cx="400" cy="286" rx="118" ry="12" fill={p.muted} opacity="0.4" />
      <rect x="320" y="226" width="160" height="60" rx="8" fill={p.accent} opacity="0.8" />
      <rect x="352" y="182" width="96" height="48" rx="8" fill={p.accent} opacity="0.92" />
      {[378, 400, 422].map((x, i) => (
        <g key={i}>
          <rect x={x - 2} y="150" width="4" height="34" fill={p.muted} opacity="0.7" />
          <path d={`M${x} 150 q5 -8 0 -16 q-5 8 0 16 z`} fill={p.accent} />
        </g>
      ))}
    </>
  ),

  // A marigold garland dipping across the top over a raised row of diyas —
  // Diwali, pujas. Both centred so they clear the arch crop.
  "diya-marigold": (id, p) => (
    <>
      <path d="M200 70 Q400 140 600 70" fill="none" stroke={p.muted} strokeWidth="2" opacity="0.4" />
      {([[210, 74], [262, 98], [322, 117], [400, 128], [478, 117], [538, 98], [590, 74]] as [number, number][]).map(([x, y], i) => (
        <g key={i}>
          {[0, 60, 120].map((a) => (
            <ellipse key={a} cx={x} cy={y} rx="11" ry="5" fill={p.accent} opacity="0.5" transform={`rotate(${a} ${x} ${y})`} />
          ))}
          <circle cx={x} cy={y} r="5" fill={p.accent} opacity="0.85" />
        </g>
      ))}
      {[290, 370, 450, 520].map((x, i) => (
        <g key={i} transform={`translate(${x} 232)`}>
          <path d="M-28 0 Q0 24 28 0 Z" fill={p.accent} opacity="0.85" />
          <ellipse cx="0" cy="0" rx="28" ry="6" fill={p.accent} />
          <path d="M0 -22 Q9 -7 0 2 Q-9 -7 0 -22 Z" fill={p.accentText} opacity="0.9" />
          <path d="M0 -30 q6 -10 0 -18" stroke={p.accent} strokeWidth="2" fill="none" opacity="0.5" />
        </g>
      ))}
    </>
  ),

  // A little house with a hanging key and two leafy branches — housewarming.
  "house-key": (id, p) => (
    <>
      {([[252, 1], [548, -1]] as [number, number][]).map(([x, dir], i) => (
        <g key={i} stroke={p.muted} strokeWidth="2" fill="none" opacity="0.5">
          <path d={`M${x} 300 q${dir * 10} -70 ${dir * 2} -132`} />
          {[0, 1, 2].map((j) => (
            <path key={j} d={`M${x + dir * (2 + j)} ${248 - j * 42} l${dir * 24} -10`} />
          ))}
        </g>
      ))}
      <g stroke={p.accent} strokeWidth="3" fill="none" opacity="0.7">
        <rect x="350" y="172" width="100" height="90" />
        <path d="M336 174 L400 120 L464 174" />
        <rect x="388" y="214" width="24" height="48" />
      </g>
      <g stroke={p.accent} strokeWidth="3" fill="none" opacity="0.6">
        <circle cx="470" cy="150" r="9" />
        <path d="M470 159 L470 196 M470 186 l8 0 M470 178 l8 0" />
      </g>
    </>
  ),

  // A coupe glass with a citrus wheel and sparkler lines — cocktail parties.
  "cocktail-coupe": (id, p) => (
    <>
      {([[300, 20], [500, -20]] as [number, number][]).map(([x, rot], i) => (
        <g key={i} stroke={p.muted} strokeWidth="2" opacity="0.4" transform={`rotate(${rot} ${x} 150)`}>
          <line x1={x} y1="88" x2={x} y2="212" />
          {[0, 1, 2, 3].map((j) => (
            <line key={j} x1={x - 8} y1={102 + j * 30} x2={x + 8} y2={102 + j * 30} />
          ))}
        </g>
      ))}
      <path d="M350 118 Q400 182 450 118 Z" fill={p.accent} fillOpacity="0.22" stroke={p.accent} strokeWidth="3" opacity="0.8" />
      <line x1="400" y1="168" x2="400" y2="252" stroke={p.accent} strokeWidth="3" opacity="0.7" />
      <line x1="366" y1="254" x2="434" y2="254" stroke={p.accent} strokeWidth="3" opacity="0.7" />
      <circle cx="446" cy="118" r="12" fill={p.accent} opacity="0.7" />
      <circle cx="446" cy="118" r="5" fill={p.bg} />
      {([[400, 150], [392, 136], [408, 142]] as [number, number][]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={p.bg} opacity="0.7" />
      ))}
    </>
  ),

  // A single stem and bloom in a vase, off-centre — the all-purpose one.
  "single-stem": (id, p) => (
    <>
      <path d="M360 300 Q356 250 376 240 L424 240 Q444 250 440 300 Z" fill={p.muted} opacity="0.4" />
      <path d="M376 240 Q400 232 424 240" fill="none" stroke={p.muted} strokeWidth="2" opacity="0.5" />
      <path d="M408 242 Q392 160 408 92" fill="none" stroke={p.accent} strokeWidth="3" opacity="0.6" />
      <path d="M400 188 Q360 178 352 148 Q392 156 400 188 Z" fill={p.muted} opacity="0.5" />
      <path d="M404 158 Q444 148 452 120 Q412 128 404 158 Z" fill={p.muted} opacity="0.5" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx="408" cy="80" rx="10" ry="20" fill={p.accent} opacity="0.6" transform={`rotate(${a} 408 96)`} />
      ))}
      <circle cx="408" cy="96" r="9" fill={p.accent} />
    </>
  ),

  // --- Muse premium batch (2026) — one motif per style -------------------

  // Art-deco rayed fan from the base with stepped corner brackets — Gilded Fan.
  "deco-fan": (id, p) => (
    <>
      <g transform="translate(400 296)">
        {Array.from({ length: 21 }, (_, i) => {
          const rad = ((180 + (i / 20) * 180) * Math.PI) / 180;
          const len = i % 2 ? 158 : 104;
          return <line key={i} x1={Math.cos(rad) * 48} y1={Math.sin(rad) * 48} x2={Math.cos(rad) * (48 + len)} y2={Math.sin(rad) * (48 + len)} stroke={p.accent} strokeWidth={i % 2 ? 4 : 2} opacity="0.5" />;
        })}
        <path d="M-50 0 A50 50 0 0 1 50 0" fill="none" stroke={p.accent} strokeWidth="3" opacity="0.75" />
      </g>
      {([[214, 54, 1], [586, 54, -1]] as [number, number, number][]).map(([x, y, dir], i) => (
        <path key={i} d={`M${x} ${y} l${dir * 44} 0 l0 10 l${-dir * 30} 0 l0 10 l${-dir * 16} 0 z`} fill={p.accent} opacity="0.4" />
      ))}
    </>
  ),

  // A dense band of mixed festive tiles in pop colours — Bazaar Riot.
  "pattern-band": (id, p) => {
    const pops = [p.accent, "#00a6a6", "#ffb400", p.muted];
    return (
      <>
        <rect x="170" y="42" width="460" height="86" rx="6" fill={p.accent} opacity="0.07" />
        {Array.from({ length: 11 }, (_, i) => {
          const x = 198 + i * 40;
          const col = pops[i % pops.length];
          const y = 60;
          if (i % 4 === 0) return <circle key={i} cx={x} cy={y + 24} r="13" fill={col} opacity="0.7" />;
          if (i % 4 === 1) return <path key={i} d={`M${x - 14} ${y + 38} l14 -30 l14 30`} fill="none" stroke={col} strokeWidth="4" opacity="0.7" />;
          if (i % 4 === 2) return <path key={i} d={`M${x} ${y + 6} q16 12 0 28 q-16 -16 0 -28 z`} fill={col} opacity="0.7" />;
          return <path key={i} d={`M${x} ${y + 8} l4 13 14 0 -11 9 4 14 -11 -9 -11 9 4 -14 -11 -9 14 0 z`} fill={col} opacity="0.7" />;
        })}
      </>
    );
  },

  // One thin rule with a single disc — Mono Noire. The restraint is the design.
  "mono-rule": (id, p) => (
    <>
      <line x1="210" y1="108" x2="590" y2="108" stroke={p.accent} strokeWidth="2" opacity="0.6" />
      <circle cx="516" cy="108" r="16" fill={p.accent} opacity="0.85" />
    </>
  ),

  // Loose translucent blooms over soft leaves — Washed Garden (watercolour).
  "wash-blooms": (id, p) => (
    <>
      {([[360, 122, 48], [434, 102, 56], [398, 164, 42]] as [number, number, number][]).map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={p.accent} opacity="0.28" />
      ))}
      {([[318, 206, 40], [482, 206, -40], [400, 246, 0]] as [number, number, number][]).map(([x, y, rot], i) => (
        <path key={i} d="M0 32 Q-22 0 0 -32 Q22 0 0 32 Z" transform={`translate(${x} ${y}) rotate(${rot})`} fill={p.muted} opacity="0.35" />
      ))}
      <circle cx="400" cy="132" r="18" fill={p.accent} opacity="0.5" />
    </>
  ),

  // Mid-century starburst, boomerangs and atomic dots — Diner '62 (retro).
  "starburst-boomerang": (id, p) => {
    const teal = "#2e7d74";
    return (
      <>
        <g transform="translate(362 120)">
          {Array.from({ length: 12 }, (_, i) => {
            const a = ((i / 12) * 360 * Math.PI) / 180;
            return <line key={i} x1={Math.cos(a) * 10} y1={Math.sin(a) * 10} x2={Math.cos(a) * (i % 2 ? 50 : 32)} y2={Math.sin(a) * (i % 2 ? 50 : 32)} stroke={p.accent} strokeWidth="3" opacity="0.7" />;
          })}
          <circle r="8" fill={p.accent} opacity="0.85" />
        </g>
        {([[476, 182, 20], [320, 232, -28]] as [number, number, number][]).map(([x, y, rot], i) => (
          <path key={i} d="M-26 0 Q0 -20 26 0 Q0 -7 -26 0 Z" transform={`translate(${x} ${y}) rotate(${rot})`} fill={teal} opacity="0.6" />
        ))}
        {([[300, 98], [520, 120], [484, 250], [376, 270], [446, 86]] as [number, number][]).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={i % 2 ? teal : p.accent} opacity="0.6" />
        ))}
      </>
    );
  },

  // Two mirrored laurel branches forming an open oval — Foil Laurel (luxe).
  "foil-laurel": (id, p) => {
    const branch = (dir: number, k: string) => (
      <g key={k} stroke={p.accent} strokeWidth="2.5" fill="none" opacity="0.7">
        <path d={`M400 254 Q${400 + dir * 96} 190 ${400 + dir * 70} 84`} />
        {[0, 1, 2, 3, 4, 5].map((j) => {
          const t = j / 5;
          const x = 400 + dir * (70 + 26 * Math.sin(t * Math.PI));
          const y = 254 - t * 170;
          return <ellipse key={j} cx={x} cy={y} rx="13" ry="5.5" fill={p.accent} opacity="0.4" stroke="none" transform={`rotate(${dir * 48} ${x} ${y})`} />;
        })}
      </g>
    );
    return (
      <>
        {branch(-1, "l")}
        {branch(1, "r")}
        <circle cx="400" cy="72" r="5" fill={p.accent} opacity="0.7" />
      </>
    );
  },

  // A hand-drawn double-stroke wreath with a tiny heart — Ink & Margin.
  "sketch-wreath": (id, p) => (
    <>
      <circle cx="400" cy="150" r="92" fill="none" stroke={p.accent} strokeWidth="2" opacity="0.6" />
      <circle cx="400" cy="150" r="87" fill="none" stroke={p.accent} strokeWidth="1" opacity="0.4" />
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * 360;
        const rad = (a * Math.PI) / 180;
        const x = 400 + Math.cos(rad) * 90;
        const y = 150 + Math.sin(rad) * 90;
        return <path key={i} d="M0 9 Q-6 0 0 -9 Q6 0 0 9 Z" transform={`translate(${x} ${y}) rotate(${a + 90})`} fill={p.muted} opacity="0.5" />;
      })}
      <path d="M400 236 q-7 -9 -13 -2 q-6 7 13 15 q19 -8 13 -15 q-6 -7 -13 2 z" fill={p.accent} opacity="0.65" />
    </>
  ),

  // Overlapping primary circle, square and triangle — Bauhaus Block (geometric).
  "bauhaus-shapes": (id, p) => (
    <>
      <circle cx="356" cy="140" r="58" fill="#d0342c" opacity="0.7" />
      <rect x="378" y="118" width="104" height="104" fill="#21409a" opacity="0.62" />
      <path d="M400 86 L474 214 L326 214 Z" fill="#f2b705" opacity="0.72" />
    </>
  ),

  // Diagonal bands — the quiet one, for work events and anything formal.
  stripes: (id, p) => (
    <>
      <defs>
        <pattern
          id={`${id}-p`}
          width="34"
          height="34"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="17" height="34" fill={p.accent} opacity="0.14" />
        </pattern>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-p)`} />
      <rect y="0" width="800" height="6" fill={p.accent} opacity="0.5" />
    </>
  ),
};
