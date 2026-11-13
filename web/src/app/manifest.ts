import type { MetadataRoute } from "next";

// Web app manifest, served at /manifest.webmanifest and linked from every page
// by Next's metadata convention. Two consumers:
//
// 1. Browsers offering "Install app" / "Add to Home screen".
// 2. The Android app (android/, a Trusted Web Activity built with Bubblewrap),
//    whose twa-manifest.json mirrors the name, colours, icons and start URL
//    below. Change one, change the other, and rebuild the AAB.
//
// start_url is /dashboard, not the landing page. The installed app is for
// hosts — guests open invitation links in whatever browser the link lands in
// and never install anything. A signed-in host goes straight to their events;
// a signed-out one is redirected by the dashboard layout to /login, which also
// offers "Create an account". The marketing page would be one extra tap every
// time the app is opened, selling a product to someone who already has it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "RsvpVault",
    short_name: "RsvpVault",
    description:
      "Design a digital invitation, share one link, and track every RSVP. No app or account needed for guests.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // White matches the dashboard header (the status bar sits on top of it);
    // slate-50 is the page background from the root layout.
    theme_color: "#ffffff",
    background_color: "#f8fafc",
    categories: ["lifestyle", "social", "productivity"],
    // Rendered by infra/play-store/tools/build-graphics.mjs from the favicon's
    // emoji — rerun it rather than editing these by hand.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
