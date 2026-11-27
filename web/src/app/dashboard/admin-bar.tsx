"use client";

import { FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, setTestMode, switchBackToAdmin, type Me } from "@/lib/api/host";

/**
 * Shown under the dashboard header on every page:
 *   - inside a test host: an amber banner with "Back to admin";
 *   - an admin in "Test as host": an amber banner saying so, with "Turn off";
 *   - an admin otherwise: a thin bar with the Admin link and "Test as host".
 * Nothing for an ordinary host. A display, not a boundary: the API checks the
 * real role on every admin call.
 */
export function AdminBar() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((m) => {
        if (alive) setMe(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!me) return null;

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await setTestMode(on);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  async function back() {
    setBusy(true);
    try {
      await switchBackToAdmin();
      window.location.assign("/dashboard/admin");
    } catch {
      setBusy(false);
    }
  }

  const spinner = busy ? <Loader2 className="size-3.5 animate-spin" /> : null;

  if (me.testHost) {
    return (
      <div className="border-b border-amber-300 bg-amber-100 text-amber-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <FlaskConical className="size-4 shrink-0" />
          <span>
            <strong>Test host:</strong> {me.displayName ?? "test account"}. Emails to guests are not sent (only to your
            own admin address); payments are $0.50 test payments.
          </span>
          <button type="button" onClick={() => void back()} className="ml-auto inline-flex items-center gap-1 font-medium underline">
            {spinner}Back to admin
          </button>
        </div>
      </div>
    );
  }

  if (me.role !== "admin") return null;

  if (me.testMode) {
    return (
      <div className="border-b border-amber-300 bg-amber-100 text-amber-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <FlaskConical className="size-4 shrink-0" />
          <span>
            <strong>Test as host is on.</strong> You see RsvpVault like a host: payments are $0.50 test payments, and
            emails to guests are not sent (only to your own address).
          </span>
          <span className="ml-auto flex items-center gap-3">
            <Link href="/dashboard/admin" className="font-medium underline">
              Admin
            </Link>
            <button type="button" onClick={() => void toggle(false)} className="inline-flex items-center gap-1 font-medium underline">
              {spinner}Turn off
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-1.5 text-xs text-slate-600">
        <ShieldCheck className="size-3.5" />
        <Link href="/dashboard/admin" className="font-medium text-slate-900 hover:underline">
          Admin
        </Link>
        <button type="button" onClick={() => void toggle(true)} className="ml-auto inline-flex items-center gap-1 hover:underline">
          {spinner}Test as host
        </button>
      </div>
    </div>
  );
}
