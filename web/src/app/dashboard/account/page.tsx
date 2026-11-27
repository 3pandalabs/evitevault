"use client";

import { Banknote, CircleUserRound, ExternalLink, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getGiftAccount, openGiftDashboard, type GiftAccount } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { useMe } from "../me-context";
import { PageHeader, PageSpinner, Panel } from "../ui";

const PAYOUT_STATUS: Record<GiftAccount["status"], { label: string; body: string; tone: string }> = {
  none: {
    label: "Not set up",
    body: "Set up payouts from an event's Gifts tab. Stripe asks a few questions and then pays gifts into your bank.",
    tone: "bg-zinc-100 text-zinc-600",
  },
  needs_info: {
    label: "Needs information",
    body: "Stripe needs a few more details before gifts can be paid out. Finish from an event's Gifts tab.",
    tone: "bg-amber-100 text-amber-800",
  },
  pending: {
    label: "Being verified",
    body: "Stripe is checking your details. This usually takes a few minutes.",
    tone: "bg-amber-100 text-amber-800",
  },
  ready: {
    label: "Ready",
    body: "Guests can send you cash gifts. Each payout arrives 7 days after the gift, in case of a dispute.",
    tone: "bg-emerald-100 text-emerald-800",
  },
};

/** Account: who you're signed in as, payouts for cash gifts, and leaving. */
export default function AccountPage() {
  const me = useMe();
  // undefined = loading; null = cash gifts are off for this account (API 404).
  const [payouts, setPayouts] = useState<GiftAccount | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const giftsOn = me?.features?.cashGifts === true;

  useEffect(() => {
    if (!giftsOn) return;
    let alive = true;
    getGiftAccount()
      .then((a) => {
        if (alive) setPayouts(a);
      })
      .catch(() => {
        if (alive) setPayouts(null);
      });
    return () => {
      alive = false;
    };
  }, [giftsOn]);

  if (me === undefined) return <PageSpinner />;

  async function onOpenStripe() {
    setOpening(true);
    setError(null);
    try {
      const { url } = await openGiftDashboard();
      window.open(url, "_blank", "noopener");
    } catch {
      setError("Couldn't open Stripe just now.");
    }
    setOpening(false);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Account" title="Your account" />

      <div className="space-y-5">
        <Panel title="Profile" icon={CircleUserRound}>
          {me ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Name</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">{me.displayName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Email</dt>
                <dd className="mt-0.5 font-medium break-all text-zinc-900">{me.email}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Member since</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">
                  {new Date(me.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Password</dt>
                <dd className="mt-0.5">
                  <Link href="/forgot-password" className="font-medium text-zinc-900 underline">
                    Reset by email
                  </Link>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">Couldn&apos;t load your details.</p>
          )}
        </Panel>

        {/* Cash gifts only: CASH_GIFTS is decided by the API (/auth/me). */}
        {giftsOn ? (
          <Panel
            title="Payouts for cash gifts"
            icon={Banknote}
            description="Gifts are paid by Stripe into the bank account you gave them. We never see your bank details."
          >
            {payouts === undefined ? (
              <Loader2 className="size-4 animate-spin text-zinc-400" />
            ) : payouts === null ? (
              <p className="text-sm text-zinc-500">Payouts aren&apos;t available right now.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYOUT_STATUS[payouts.status].tone}`}>
                    {PAYOUT_STATUS[payouts.status].label}
                  </span>
                  {payouts.mode === "test" ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Stripe test mode
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-zinc-600">{PAYOUT_STATUS[payouts.status].body}</p>
                {payouts.status !== "none" ? (
                  <Button variant="outline" size="sm" className="rounded-full" disabled={opening} onClick={onOpenStripe}>
                    {opening ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                    Payouts &amp; tax forms on Stripe
                  </Button>
                ) : null}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            )}
          </Panel>
        ) : null}

        {/* Admin link for real admins; the AdminBar above has the switches. */}
        {me?.role === "admin" ? (
          <Panel title="Admin" icon={ShieldCheck} description="Users, events, gifts and video orders; test as host.">
            <Link href="/dashboard/admin">
              <Button variant="outline" size="sm" className="rounded-full">
                Open admin
              </Button>
            </Link>
          </Panel>
        ) : null}

        <Panel title="Delete account" icon={Trash2} tone="danger">
          <p className="mb-4 max-w-prose text-sm text-zinc-600">
            Removes your account, every event and guest list, and their invitation links. This can&apos;t be undone.
          </p>
          <Link href="/delete-account">
            <Button variant="outline" size="sm" className="rounded-full border-red-200 text-red-700 hover:bg-red-50">
              Delete my account…
            </Button>
          </Link>
        </Panel>
      </div>
    </div>
  );
}
