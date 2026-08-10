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
