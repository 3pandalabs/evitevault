import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cover art and guestbook photos arrive as short-lived R2 presigned URLs on
  // the *.r2.cloudflarestorage.com host. next/image is deliberately not used
  // for them (see e/[slug]/page.tsx): the optimizer would cache a URL that
  // expires in ten minutes, and its cache key would then serve a dead link.
  images: { unoptimized: true },
};

export default nextConfig;
