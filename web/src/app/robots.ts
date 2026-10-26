import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// NOTE: Cloudflare injects its own managed block into /robots.txt (the
// Content-Signal preamble and the AI-crawler Disallow list). It merges with
// what this route returns rather than replacing it, so after a deploy check
// that the `Sitemap:` line below actually survives:
//
//   curl -s https://rsvpvault.3pandalabs.com/robots.txt | grep -i sitemap
//
// If it ever stops appearing, nothing breaks — Search Console takes the
// sitemap URL directly, and that submission is what discovery really relies
// on. robots.txt is the belt, not the braces.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed-in surfaces and the password flows. Nothing here renders
        // anything to a crawler anyway (the dashboard returns null until a
        // token is in localStorage), so an indexed URL would only ever be a
        // dead-looking shell in the results.
        //
        // `/e/` is deliberately NOT listed. Invitation pages already send
        // `robots: { index: false }` from generateMetadata, and that is the
        // stronger signal precisely because it requires a crawl: a URL blocked
        // in robots.txt can still be indexed from an inbound link, title-less
        // and uncrawled, because the crawler never gets to read the noindex.
        disallow: [
          "/dashboard/",
          "/login",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
