"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearTokens, getTokens } from "@/lib/api/host";
import { Button } from "@/components/ui/button";

// Client-side gate, and deliberately not a security boundary: it only decides
// what to render. Every dashboard request carries a bearer token that the API
// validates with requireAuth — that is what actually protects the data. See
// CLAUDE.md for why there is no middleware/proxy.ts doing this at the edge.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getTokens().access) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            EviteVault
          </Link>
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
