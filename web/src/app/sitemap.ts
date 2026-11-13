import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The landing page plus the public legal/help pages. Everything else is either
// behind auth or an invitation page that must stay out of search. Even a short
// list matters: it is the thing that gets a brand-new hostname crawled at all,
// since there are almost no inbound links pointing here yet.
const SECONDARY = ["/privacy", "/terms", "/contact", "/delete-account"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...SECONDARY.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
