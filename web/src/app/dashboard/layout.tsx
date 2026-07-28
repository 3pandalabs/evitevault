"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { clearTokens, getTokens } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";

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

  const signedIn = useSyncExternalStore(
    subscribe,
    () => getTokens().access !== null,
    () => false,
  );

  // A gate on what renders, NOT a security boundary. Every dashboard request
  // carries a bearer token the API validates with requireAuth — that is what
  // actually protects the data. See CLAUDE.md for why there's no middleware.
  useEffect(() => {
    if (!signedIn) router.replace("/login");
  }, [signedIn, router]);

  if (!signedIn) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="inline-flex items-center">
            <Link href="/dashboard" className="font-semibold">
              <WordmarkName />
            </Link>
            <WordmarkTag />
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearTokens();
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
