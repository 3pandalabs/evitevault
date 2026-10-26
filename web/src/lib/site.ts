// The site's own public origin.
//
// Every absolute URL Next.js generates — canonical links, OpenGraph `url`,
// sitemap entries — resolves against this. Without it they come out relative,
// which Google treats as missing rather than as "same origin", and the link
// preview in WhatsApp/Slack silently loses its URL.
//
// Read from the env var rather than hardcoded so a preview deploy describes
// itself instead of claiming to be production. The fallback is the real host,
// not localhost, because `next build` inlines NEXT_PUBLIC_* at build time (see
// the comment in web/.env.production) and a wrong value here stays invisible
// until something external tries to follow it.
//
// Lives in lib/ rather than in layout.tsx so that robots.ts and sitemap.ts can
// import it without dragging the root layout into their route bundles.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rsvpvault.3pandalabs.com";
