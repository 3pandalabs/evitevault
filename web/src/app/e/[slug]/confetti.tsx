"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 2400;
const PARTICLE_COUNT = 90;
const GRAVITY = 0.12;
const DRAG = 0.992;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  spin: number;
  angle: number;
};

/** Reads a CSS custom property off the themed wrapper, if it resolves to one. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const el = document.querySelector(".ev-themed") ?? document.documentElement;
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * A one-shot confetti burst, hand-rolled rather than pulled from a package.
 * It is ~80 lines against ~5KB of dependency on a page guests load on phones,
 * and it lets the colours come from the invitation's own palette instead of a
 * library's defaults.
 *
 * Mount it with a changing `key` to replay; it cleans itself up when the
 * animation ends.
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // A celebratory animation is exactly the kind of motion this setting
    // exists to suppress — for some people it is a migraine or vestibular
    // trigger, not a preference. Nothing else on the page depends on it, so
    // skipping it entirely is the whole accommodation.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // The event's own accent leads, with a fixed festive set behind it so a
    // muted palette still reads as celebration rather than as a glitch.
    const colors = [
      cssVar("--ev-accent", "#b45309"),
      "#f59e0b",
      "#ef4444",
      "#10b981",
      "#6366f1",
      "#ec4899",
    ];

    const w = window.innerWidth;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      // Two vents, left and right, angled inward — a single centre burst reads
      // as an explosion; two arcs read as a party popper.
      const fromLeft = Math.random() < 0.5;
      const speed = 7 + Math.random() * 7;
      const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 46;
      const rad = (angle * Math.PI) / 180;
      return {
        x: fromLeft ? w * 0.12 : w * 0.88,
        y: window.innerHeight * 0.72,
        vx: Math.cos(rad) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(rad) * speed,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        spin: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI,
      };
    });

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Fade the whole burst out rather than letting pieces vanish mid-air.
      ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);

      for (const p of particles) {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        // Rectangles, not circles: the flutter of a rotating strip is what
        // reads as paper.
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
