// The card motion layer — a subtle particle animation drawn over a static card.
// Shared by the live in-app preview (AnimatedOverlay) and the GIF export, so
// what you download is what you saw. Pure canvas drawing, palette-coloured.

export type MotionKind =
  | "none"
  | "confetti"
  | "sparkle"
  | "snow"
  | "petals"
  | "bubbles"
  | "hearts"
  | "float"
  | "shimmer";

export const MOTIONS: MotionKind[] = [
  "none",
  "confetti",
  "sparkle",
  "snow",
  "petals",
  "bubbles",
  "hearts",
  "float",
  "shimmer",
];

export function motionLabel(kind: MotionKind): string {
  return kind === "none" ? "No animation" : kind[0].toUpperCase() + kind.slice(1);
}

// A sensible default motion for each built-in artwork, so a design animates
// appropriately out of the box. Falls back to a gentle float.
const BY_ART: Record<string, MotionKind> = {
  confetti: "confetti",
  "confetti-arcs": "confetti",
  "pattern-band": "confetti",
  "tiered-cake": "confetti",
  balloons: "float",
  "balloon-cluster": "float",
  stars: "sparkle",
  snowflakes: "snow",
  pine: "snow",
  "pine-berry": "snow",
  petals: "petals",
  marigold: "petals",
  "arched-florals": "petals",
  "wash-blooms": "petals",
  "single-stem": "float",
  diyas: "sparkle",
  "diya-marigold": "sparkle",
  mandala: "sparkle",
  rings: "shimmer",
  "foil-laurel": "shimmer",
  "deco-fan": "shimmer",
  sunburst: "shimmer",
  "cocktail-coupe": "bubbles",
  stripes: "shimmer",
  "mono-rule": "shimmer",
  "sketch-wreath": "sparkle",
};

export function motionForArt(art: string | null | undefined): MotionKind {
  if (!art) return "float";
  return BY_ART[art] ?? "float";
}

export type Particle = {
  x: number;
  y: number;
  size: number;
  rot: number;
  phase: number;
  drift: number;
  tint: number;
};

export function makeParticles(kind: MotionKind): Particle[] {
  const count = kind === "confetti" ? 60 : kind === "snow" ? 44 : 30;
  // Deterministic seeded layout — scattered without Math.random().
  return Array.from({ length: count }, (_, i) => ({
    x: ((i * 83) % 100) / 100,
    y: ((i * 37) % 100) / 100,
    size: 0.4 + ((i * 53) % 60) / 100,
    rot: (i * 29) % 360,
    phase: ((i * 47) % 100) / 100,
    drift: (((i * 17) % 100) / 100 - 0.5) * 2,
    tint: i % 3,
  }));
}

/**
 * Draws one frame of the motion into `ctx` at time `t` seconds. Does not clear —
 * the caller owns the surface (the live overlay clears each frame; the GIF
 * export composites over a fresh copy of the card).
 */
export function drawMotion(
  ctx: CanvasRenderingContext2D,
  opts: { kind: MotionKind; color: string; t: number; W: number; H: number; dpr: number; parts: Particle[] },
): void {
  const { kind, color, t, W, H, dpr, parts } = opts;
  if (kind === "none") return;

  if (kind === "shimmer") {
    const sweep = ((t * 0.3) % 1.6) - 0.3;
    const cx = sweep * W;
    const grad = ctx.createLinearGradient(cx - W * 0.22, 0, cx + W * 0.22, H);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const palette = [color, "#ffffff", color];
  for (const p of parts) {
    if (kind === "sparkle") {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.6 + p.phase * 6.28));
      const x = p.x * W;
      const y = p.y * H;
      const s = p.size * 6 * dpr * tw;
      ctx.globalAlpha = 0.25 + 0.6 * tw;
      ctx.fillStyle = palette[p.tint];
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.quadraticCurveTo(x, y, x + s, y);
      ctx.quadraticCurveTo(x, y, x, y + s);
      ctx.quadraticCurveTo(x, y, x - s, y);
      ctx.quadraticCurveTo(x, y, x, y - s);
      ctx.fill();
    } else if (kind === "snow") {
      const fall = (p.y + t * 0.06 * p.size) % 1;
      const x = (p.x + Math.sin(t * 0.8 + p.phase * 6.28) * 0.03) * W;
      const y = fall * H;
      ctx.globalAlpha = 0.5 + 0.3 * p.size;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, p.size * 2.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "petals") {
      const fall = (p.y + t * 0.07 * p.size) % 1;
      const x = (p.x + Math.sin(t * 1.0 + p.phase * 6.28) * 0.06) * W;
      const y = fall * H;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = palette[p.tint];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((p.rot + t * 60 * p.drift) * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3 * dpr * p.size, 6.5 * dpr * p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (kind === "bubbles") {
      const rise = 1 - ((p.y + t * 0.08 * p.size) % 1);
      const x = (p.x + Math.sin(t * 1.4 + p.phase * 6.28) * 0.02) * W;
      const y = rise * H;
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = palette[p.tint];
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 6 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "hearts") {
      const fall = (p.y + t * 0.09 * p.size) % 1;
      const x = (p.x + Math.sin(t * 1.0 + p.phase * 6.28) * 0.05) * W;
      const y = fall * H;
      const s = p.size * 5 * dpr;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = palette[p.tint];
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s, -s * 0.6, -s * 0.5, -s * 1.1, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.5, -s * 1.1, s, -s * 0.6, 0, s * 0.3);
      ctx.fill();
      ctx.restore();
    } else if (kind === "float") {
      const rise = 1 - ((p.y + t * 0.03 * (0.5 + p.size)) % 1);
      const x = (p.x + Math.sin(t * 0.6 + p.phase * 6.28) * 0.04) * W;
      const y = rise * H;
      ctx.globalAlpha = 0.22 + 0.16 * p.size;
      ctx.fillStyle = palette[p.tint];
      ctx.beginPath();
      ctx.arc(x, y, p.size * 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // confetti
      const fall = (p.y + t * 0.12 * (0.6 + p.size)) % 1.1;
      const x = (p.x + Math.sin(t * 1.2 + p.phase * 6.28) * 0.06 * p.drift) * W;
      const y = fall * H;
      const w = (p.tint === 2 ? 3 : 5) * dpr * p.size;
      const h = (p.tint === 2 ? 9 : 5) * dpr * p.size;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = palette[p.tint];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((p.rot + t * 90 * p.drift) * Math.PI) / 180);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
