import type { Metadata } from "next";
import Link from "next/link";
import { FollowUs } from "@/components/FollowUs";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const HOME_TITLE = "RsvpVault — Digital invitations and RSVP tracking | by 3PandaLabs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    // Page titles render as "<page> — RsvpVault" (org rule: em dash on every
    // non-home page). The invitation page sets its own title the same way, so
    // a shared link leads with the event name.
    template: "%s — RsvpVault",
  },
  description:
    "Design a digital invitation, share one link, and track every RSVP — going, maybe, plus-ones and dietary notes. Afterwards, send your whole guest list a shared photo album. No app or account for guests.",
  applicationName: "RsvpVault",
  openGraph: {
    type: "website",
    siteName: "RsvpVault by 3PandaLabs",
    locale: "en",
    url: "/",
    title: HOME_TITLE,
    description:
      "Design a digital invitation, share one link, track every RSVP, and send the photos afterwards. No app or account for guests.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "RsvpVault — Digital invitations and RSVP tracking" }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description:
      "Design a digital invitation, share one link, track every RSVP, and send the photos afterwards.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <div className="flex-1">{children}</div>
        {/* On every page — landing, invitations and the dashboard — since this
            footer is the root layout's. Dark bar so it reads as the page's
            foot wherever it sits, on light dashboards and the dark landing. */}
        <footer className="bg-slate-950 px-6 py-8 text-slate-400">
          <div className="mx-auto w-full max-w-5xl text-sm">
            <div className="flex flex-wrap items-center justify-between gap-y-3">
              <nav aria-label="Legal" className="flex flex-wrap gap-5">
                <Link href="/privacy" className="hover:text-white">
                  Privacy
                </Link>
                <Link href="/terms" className="hover:text-white">
                  Terms
                </Link>
                <Link href="/#faq" className="hover:text-white">
                  FAQ
                </Link>
                <Link href="/contact" className="hover:text-white">
                  Contact us
                </Link>
              </nav>
              <FollowUs />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-y-1 text-xs text-slate-500">
              <span>&copy; 3PandaLabs LLC, USA.</span>
              <span>All rights reserved.</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Built by pandas. Loved by people.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
