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
        <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-center text-sm text-slate-500">
          <p>&copy; 3PandaLabs LLC, USA.</p>
          <p>All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
