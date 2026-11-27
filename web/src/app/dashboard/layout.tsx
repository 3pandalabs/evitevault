"use client";

import { CalendarHeart, CircleUserRound, MessageSquareHeart, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { clearTokens, getTokens } from "@/lib/api/host";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { AdminBar } from "./admin-bar";
import { MeProvider } from "./me-context";

// localStorage is an external store, so it is read with useSyncExternalStore
// rather than copied into state inside an effect. Two things fall out of that
// for free: the server snapshot is always "signed out", so prerender and
// hydration agree, and signing out in one tab redirects the others, because the
// `storage` event is a real subscription rather than a one-shot read on mount.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // null = not known yet. The server snapshot (also used for the hydration
  // render on the client) can't see localStorage, so it must not claim
  // "signed out": effects from the hydration render run with that value, and
  // redirecting on it bounced every signed-in reload of /dashboard to /login
  // before the real client snapshot arrived on the next render.
  const signedIn = useSyncExternalStore<boolean | null>(
    subscribe,
    () => getTokens().access !== null,
    () => null,
  );

  // A gate on what renders, NOT a security boundary. Every dashboard request
  // carries a bearer token the API validates with requireAuth — that is what
  // actually protects the data. See CLAUDE.md for why there's no middleware.
  useEffect(() => {
    if (signedIn === false) router.replace("/login");
  }, [signedIn, router]);

  if (!signedIn) return null;

  return (
    <MeProvider>
      <div className={`flex min-h-screen flex-col text-zinc-900 ${geistSans.className}`}>
        {/* The same soft backdrop as the sign-in page, so the signed-in app
            reads as the public site's interior rather than a different product. */}
        <GradientBackdrop />
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <span className="inline-flex shrink-0 items-center">
              <Link href="/dashboard" className="text-lg font-semibold">
                <WordmarkName />
              </Link>
              <span className="hidden sm:inline">
                <WordmarkTag />
              </span>
            </span>
            <DashboardNav className="hidden md:flex" />
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/dashboard/events/new"
                className="hidden items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-10px_rgba(24,24,27,.6)] transition-transform hover:-translate-y-0.5 sm:inline-flex"
              >
                <Plus className="size-4" />
                New event
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearTokens();
                  router.replace("/login");
                }}
                className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                Sign out
              </button>
            </div>
          </div>
          {/* Phones: the section nav gets its own scrollable row. */}
          <div className="border-t border-zinc-100 md:hidden">
            <DashboardNav className="mx-auto flex max-w-6xl overflow-x-auto px-3 py-1.5" />
          </div>
        </header>
        {/* Admin tools: test-mode / test-host banners and the Admin link. */}
        <AdminBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      </div>
    </MeProvider>
  );
}

const NAV = [
  { href: "/dashboard", label: "Events", icon: CalendarHeart, match: ["/dashboard", "/dashboard/events"] },
  { href: "/dashboard/greetings", label: "Greetings", icon: MessageSquareHeart, match: ["/dashboard/greetings"] },
  { href: "/dashboard/account", label: "Account", icon: CircleUserRound, match: ["/dashboard/account"] },
];

function DashboardNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const active = (match: string[]) =>
    match.some((m) =>
      m === "/dashboard" ? pathname === "/dashboard" : pathname === m || pathname.startsWith(`${m}/`),
    );
  return (
    <nav aria-label="Sections" className={cn("items-center gap-1", className)}>
      {NAV.map((n) => {
        const on = active(n.match);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            <n.icon className="size-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
