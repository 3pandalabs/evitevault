"use client";

import { useEffect, useRef } from "react";
import { drawMotion, makeParticles, type MotionKind } from "@/lib/card/motion";

/**
 * The live motion layer, composited over a static card via a transparent
 * canvas. Pauses when off-screen so a page of animated cards stays smooth.
 */
export function AnimatedOverlay({ kind, color }: { kind: MotionKind; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (kind === "none") return;
    const canvas = ref.current;
    if (!canvas) return;
    const g2d = canvas.getContext("2d");
    if (!g2d) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    }, { threshold: 0.02 });
    io.observe(canvas);

    const parts = makeParticles(kind);
    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      if (!visible) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const W = canvas.width;
      const H = canvas.height;
      g2d.clearRect(0, 0, W, H);
      drawMotion(g2d, { kind, color, t: (now - start) / 1000, W, H, dpr, parts });
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [kind, color]);

  if (kind === "none") return null;
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
