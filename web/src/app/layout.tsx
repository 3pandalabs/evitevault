import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RsvpVault — digital invitations and RSVP tracking",
    // Page titles render as "<page> · RsvpVault". The invitation page sets its
    // own absolute title instead, so a shared link leads with the event name.
    template: "%s · RsvpVault",
  },
  description:
    "Design a digital invitation, share one link, and track every RSVP — going, maybe, plus-ones and dietary notes. Afterwards, send your whole guest list a shared photo album. No app or account for guests.",
  applicationName: "RsvpVault",
  openGraph: {
    type: "website",
    siteName: "RsvpVault",
    locale: "en",
    url: SITE_URL,
    title: "RsvpVault — digital invitations and RSVP tracking",
    description:
      "Design a digital invitation, share one link, track every RSVP, and send the photos afterwards. No app or account for guests.",
  },
  twitter: {
    card: "summary",
    title: "RsvpVault — digital invitations and RSVP tracking",
    description:
      "Design a digital invitation, share one link, track every RSVP, and send the photos afterwards.",
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
          </div>
        </footer>
      </body>
    </html>
  );
}
