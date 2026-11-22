import type { Metadata } from "next";
import Link from "next/link";
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
        <footer className="border-t border-slate-200 px-6 py-8">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>&copy; 3PandaLabs LLC, USA.</span>
            <span>All rights reserved.</span>
            {/* On every page — landing, invitations and the dashboard — since
                this footer is the root layout's. */}
            <nav aria-label="Legal" className="flex gap-4">
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-slate-900">
                Terms
              </Link>
              <Link href="/contact" className="hover:text-slate-900">
                Contact
              </Link>
            </nav>
            <p className="mt-1 basis-full text-xs text-slate-500">
              Built by pandas. Loved by people.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
