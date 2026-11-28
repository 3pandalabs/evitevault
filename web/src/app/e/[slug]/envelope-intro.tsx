"use client";

import { useEffect, useState } from "react";

// The envelope-opening moment when a guest first opens the invitation. Plays
// once per browser session per invitation, can be skipped with a tap, and is
// never shown to anyone who asked for reduced motion (or without JS: the
// page underneath is fully rendered, this only overlays it).
export function EnvelopeIntro({ slug, title }: { slug: string; title: string }) {
  const [phase, setPhase] = useState<"hidden" | "closed" | "opening" | "gone">("hidden");

  useEffect(() => {
    const key = `ev_envelope_${slug}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode / blocked storage: just play it.
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Deferred to the next frame: a synchronous setState in an effect is
    // what the React lint rule flags, and it also lets the page paint first.
    const raf = requestAnimationFrame(() => setPhase("closed"));
    const t1 = window.setTimeout(() => setPhase("opening"), 450);
    const t2 = window.setTimeout(() => setPhase("gone"), 1900);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [slug]);

  if (phase === "hidden" || phase === "gone") return null;
  const opening = phase === "opening";

  return (
    <div
      aria-hidden="true"
      onClick={() => setPhase("gone")}
      className="ev-envelope fixed inset-0 z-[60] flex cursor-pointer items-center justify-center"
      style={{ backgroundColor: "var(--ev-bg)", animation: opening ? "ev-env-fade 0.6s ease 0.9s forwards" : undefined }}
    >
      <style>{`
        @keyframes ev-env-flap { from { transform: rotateX(0deg); } to { transform: rotateX(180deg); } }
        @keyframes ev-env-card { from { transform: translateY(0); } to { transform: translateY(-46%); } }
        @keyframes ev-env-fade { to { opacity: 0; visibility: hidden; } }
        @media (prefers-reduced-motion: reduce) { .ev-envelope { display: none !important; } }
      `}</style>
      <div className="relative" style={{ width: "min(78vw, 320px)", height: "min(52vw, 214px)", perspective: "800px" }}>
        {/* The card inside, rising out as the flap opens. */}
        <div
          className="absolute inset-x-[8%] top-[8%] bottom-[4%] flex items-center justify-center rounded-md px-3 text-center shadow"
          style={{
            backgroundColor: "var(--ev-surface)",
            color: "var(--ev-text)",
            animation: opening ? "ev-env-card 0.7s ease-out 0.35s forwards" : undefined,
          }}
        >
          <span className="ev-heading line-clamp-2 text-base font-semibold">{title}</span>
        </div>
        {/* Envelope body (front pocket). */}
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            background: "var(--ev-accent)",
            clipPath: "polygon(0 35%, 50% 72%, 100% 35%, 100% 100%, 0 100%)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          }}
        />
        {/* Flap, hinged on the top edge. */}
        <div
          className="absolute inset-x-0 top-0 h-[62%] origin-top"
          style={{
            background: "var(--ev-accent)",
            filter: "brightness(0.9)",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            animation: opening ? "ev-env-flap 0.45s ease-in forwards" : undefined,
            backfaceVisibility: "hidden",
          }}
        />
        <p className="absolute -bottom-10 inset-x-0 text-center text-xs opacity-60" style={{ color: "var(--ev-text)" }}>
          Tap to open
        </p>
      </div>
    </div>
  );
}
