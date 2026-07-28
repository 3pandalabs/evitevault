import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EviteVault",
  description: "Design an invitation, share one link, track every RSVP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
