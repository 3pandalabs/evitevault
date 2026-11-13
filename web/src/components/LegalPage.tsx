// Long-form layout for the public legal and help pages (/privacy, /terms,
// /contact, /delete-account), adapted from TransitVault's and BorrowVault's.
// Server component; the repo has no typography plugin, so prose styles live
// here rather than in a `prose` class.
import Link from "next/link";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";

/** The one public mailbox, same as the other 3PandaLabs apps publish. Also the API's SUPPORT_EMAIL default. */
export const SUPPORT_EMAIL = "support@3pandalabs.com";
export const PRIVACY_EMAIL = "privacy@3pandalabs.com";
export const LAST_UPDATED = "2026-11-13";

export type TocEntry = { id: string; title: string };

const NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

export function LegalPage({
  title,
  updated,
  intro,
  toc,
  children,
}: {
  title: string;
  /** Shown as "Last updated …" on the legal pages; omit on help pages. */
  updated?: string;
  intro?: React.ReactNode;
  toc?: TocEntry[];
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${geistSans.className}`}>
      <GradientBackdrop />
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <span className="inline-flex items-center">
          <Link href="/" className="text-lg font-semibold text-zinc-900">
            <WordmarkName />
          </Link>
          <WordmarkTag />
        </span>
        <nav className="flex gap-4 text-sm text-zinc-500">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-zinc-900">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <article className="rounded-3xl border border-zinc-200 bg-white/90 p-6 backdrop-blur-sm sm:p-10">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {updated ? <p className="mt-2 text-sm text-zinc-500">Last updated {updated}</p> : null}
          {intro ? <div className="mt-6 space-y-4 text-[15px] leading-7 text-zinc-800">{intro}</div> : null}
          {toc?.length ? (
            <nav aria-label="Contents" className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="text-sm font-semibold text-zinc-900">Contents</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {toc.map((e) => (
                  <li key={e.id}>
                    <a href={`#${e.id}`} className="text-amber-700 hover:underline">
                      {e.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="mt-10 space-y-10">{children}</div>
        </article>
      </main>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-zinc-800">{children}</div>
    </section>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function Mail({ to = SUPPORT_EMAIL }: { to?: string }) {
  return (
    <a href={`mailto:${to}`} className="font-medium text-amber-700 hover:underline">
      {to}
    </a>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-amber-700 hover:underline">
      {children}
    </Link>
  );
}
