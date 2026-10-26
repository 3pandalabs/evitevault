import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// One entry, on purpose. The landing page is the only public, indexable URL in
// the app: everything else is either behind auth or an invitation page that
// must stay out of search. Listing a single URL is not a pointless sitemap —
// it is the thing that gets a brand-new hostname crawled at all, since there
// are almost no inbound links pointing here yet.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
