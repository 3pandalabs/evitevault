"use client";

import { ExternalLink, Gift, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  getEventGifts,
  getGiftAccount,
  openGiftDashboard,
  startGiftOnboarding,
  updateEventGifts,
  type EventGifts,
  type GiftAccount,
} from "@/lib/api/host";
import { dollars } from "@/lib/gifts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  gifts_test_unavailable: "Gifts can't be tested yet: Stripe test mode isn't set up. Nothing was charged.",
  gifts_unavailable: "Cash gifts aren't available right now.",
  gifts_account_not_ready: "Finish setting up payouts with Stripe first.",
};

const STATUS: Record<GiftAccount["status"], string> = {
  none: "Not set up",
  needs_info: "Stripe needs a few more details",
  pending: "Stripe is checking your details",
  ready: "Ready to receive gifts",
};

/**
 * Cash gifts on the event page. The host sets up payouts once with Stripe
 * (Stripe-hosted Express onboarding), then turns gifts on per event. Guests
 * send gifts from the invitation; the host sees who sent what here. Renders
 * nothing while the API has the feature off for this account.
 */
export function CashGiftsCard({ eventId }: { eventId: string }) {
  const [account, setAccount] = useState<GiftAccount | null>(null);
  const [data, setData] = useState<EventGifts | null>(null);
  const [suggested, setSuggested] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getGiftAccount()
      .then((a) => {
        setAccount(a);
        if (!a) return;
        return getEventGifts(eventId).then((d) => {
          setData(d);
          setSuggested(d.suggestedCents.map((c) => String(c / 100)).join(", "));
          setMessage(d.message ?? "");
        });
      })
      .catch(() => undefined);
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    getGiftAccount()
      .then(async (a) => {
        if (!alive) return;
        setAccount(a);
        if (!a) return;
        const d = await getEventGifts(eventId);
        if (!alive) return;
        setData(d);
        setSuggested(d.suggestedCents.map((c) => String(c / 100)).join(", "));
        setMessage(d.message ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [eventId]);

  if (!account || !data) return null;

  const fail = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : "";
    setError(ERRORS[code] ?? "Something went wrong. Please try again.");
    setBusy(false);
  };

  async function onSetup() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await startGiftOnboarding(eventId);
      window.location.assign(url);
    } catch (err) {
      fail(err);
    }
  }

  async function onDashboard() {
    setBusy(true);
    try {
      const { url } = await openGiftDashboard();
      window.open(url, "_blank", "noopener");
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  async function onSave(enabled: boolean) {
    setError(null);
    setBusy(true);
    try {
      const cents = suggested
        .split(/[,\s]+/)
        .map((s) => Math.round(Number(s.replace(/^\$/, "")) * 100))
        .filter((n) => Number.isFinite(n) && n > 0);
      await updateEventGifts(eventId, { enabled, suggestedCents: cents, message: message.trim() || null });
      load();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  const ready = account.status === "ready";
  const paid = data.gifts.filter((g) => g.status === "paid");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-4 text-slate-400" />
          Cash gifts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {account.mode === "test" ? (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            Test mode: gifts here use Stripe test payments only. No real money moves.
          </p>
        ) : null}

        {!account.available ? (
          <p className="text-slate-600">
            {account.reason === "test_unavailable"
              ? "Gifts can't be tested yet: Stripe test mode isn't set up."
              : "Cash gifts aren't available right now."}
          </p>
        ) : !ready ? (
          <div className="space-y-3">
            <p className="text-slate-600">
              Let guests send you a cash gift with their RSVP. Set up payouts once with Stripe (it checks your identity
              and bank details); gifts arrive in your bank account about 7 days after they&apos;re sent.
            </p>
            <p className="text-xs text-slate-500">Status: {STATUS[account.status]}</p>
            <Button onClick={() => void onSetup()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
              {account.status === "none" ? "Turn on gifts" : "Continue setup with Stripe"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">{STATUS.ready}.</span>
              <Button variant="outline" size="sm" onClick={() => void onDashboard()} disabled={busy}>
                <ExternalLink className="size-3.5" />
                Open my Stripe dashboard
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gift-suggested">Suggested amounts (optional, in dollars)</Label>
              <Input
                id="gift-suggested"
                value={suggested}
                onChange={(e) => setSuggested(e.target.value)}
                placeholder="25, 50, 100"
              />
              <p className="text-xs text-slate-500">
                Guests can give {dollars(data.limits.minCents)} to {dollars(data.limits.maxCents)}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-message">Note to guests (optional)</Label>
              <Textarea
                id="gift-message"
                rows={2}
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your presence is the best gift! If you'd like to contribute to our honeymoon…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {data.enabled ? (
                <>
                  <Button onClick={() => void onSave(true)} disabled={busy}>
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => void onSave(false)} disabled={busy}>
                    Turn off gifts for this event
                  </Button>
                </>
              ) : (
                <Button onClick={() => void onSave(true)} disabled={busy}>
                  <Gift className="size-4" />
                  Show gifts on this invitation
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <p className="font-medium">
                Received: {dollars(data.receivedCents)} from {paid.length} guest{paid.length === 1 ? "" : "s"}
              </p>
              {data.gifts.map((g) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.guestName ?? "A guest"}</span>
                    <span>{dollars(g.amountCents)}</span>
                    {g.status !== "paid" ? <span className="text-xs text-amber-700">{g.status.replace("_", " ")}</span> : null}
                    {g.testMode ? <span className="text-xs text-slate-500">test</span> : null}
                  </div>
                  {g.guestMessage ? <p className="mt-1 text-slate-600">{g.guestMessage}</p> : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
