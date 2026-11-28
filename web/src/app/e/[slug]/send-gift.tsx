"use client";

import { Gift, Loader2 } from "lucide-react";
import { useState } from "react";
import { ApiError, startGift } from "@/lib/api/browser";
import type { PublicEvent } from "@/lib/api/public";
import { dollars, giftBreakdown } from "@/lib/gifts";

type Gifts = NonNullable<PublicEvent["gifts"]>;

const ERRORS: Record<string, string> = {
  amount_too_small: "Please choose a larger amount.",
  amount_too_large: "Please choose a smaller amount.",
  event_daily_cap: "This invitation can't take more gifts today. Please try again tomorrow.",
  event_cap: "This invitation can't take more gifts.",
  too_many_requests: "Too many tries. Please wait a bit and try again.",
  gifts_not_available: "Gifts aren't available for this invitation right now.",
  checkout_failed: "Couldn't open the payment page. Please try again.",
};

/**
 * "Send a gift" on the invitation. The guest picks an amount and sees the
 * full breakdown (gift to the host + card processing and service fee) before
 * paying on Stripe's page. No account needed. Never shows what others gave.
 */
export function SendGift({ slug, hostName, gifts, thanks }: { slug: string; hostName: string | null; gifts: Gifts; thanks: boolean }) {
  const presets = gifts.suggestedCents.length ? gifts.suggestedCents : [2500, 5000, 10_000];
  const [amount, setAmount] = useState(String(presets[Math.min(1, presets.length - 1)] / 100));
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = Math.round(Number(amount.replace(/^\$/, "")) * 100);
  const valid = Number.isFinite(cents) && cents >= gifts.minCents && cents <= gifts.maxCents;
  const b = valid ? giftBreakdown(cents, gifts.fees) : null;

  async function onGive() {
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      const { checkoutUrl } = await startGift(slug, {
        amountCents: cents,
        name: name.trim() || null,
        message: message.trim() || null,
      });
      window.location.assign(checkoutUrl);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "checkout_failed";
      setError(ERRORS[code] ?? "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (thanks) {
    return (
      <section id="gift" className="ev-surface mt-8 scroll-mt-6 rounded-2xl p-5 shadow-sm sm:p-8">
        <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
          <Gift className="size-5" />
          Thank you!
        </h2>
        <p className="ev-muted mt-1 text-sm">Your gift is on its way to {hostName ?? "the host"}.</p>
      </section>
    );
  }

  const field = "w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-slate-900";

  return (
    <section id="gift" className="ev-surface mt-8 scroll-mt-6 rounded-2xl p-5 shadow-sm sm:p-8">
      <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
        <Gift className="size-5" />
        Send a gift
      </h2>
      {gifts.message ? <p className="ev-muted mt-1 whitespace-pre-line text-sm">{gifts.message}</p> : null}
      {gifts.testMode ? (
        <p className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
          Test invitation: payments use Stripe test mode. No real money moves.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAmount(String(c / 100))}
            className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium"
            style={cents === c ? { backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" } : undefined}
          >
            {dollars(c)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="ev-muted mb-1 block">Amount (USD)</span>
          <input
            className={field}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="gift-limits"
          />
          <span id="gift-limits" className="ev-muted mt-1 block text-xs">
            {dollars(gifts.minCents)} to {dollars(gifts.maxCents)}
          </span>
        </label>
        <label className="text-sm">
          <span className="ev-muted mb-1 block">Your name (optional)</span>
          <input className={field} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="ev-muted mb-1 block">Message (optional)</span>
          <textarea className={field} rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
      </div>

      {b ? (
        <dl className="mt-4 space-y-1 rounded-lg bg-black/5 p-3 text-sm">
          <div className="flex justify-between">
            <dt>Gift to {hostName ?? "the host"}</dt>
            <dd>{dollars(b.giftCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="ev-muted">Card processing and service fee</dt>
            <dd className="ev-muted">{dollars(b.totalCents - b.giftCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-1 font-semibold">
            <dt>You pay</dt>
            <dd>{dollars(b.totalCents)}</dd>
          </div>
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void onGive()}
        disabled={!valid || busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
        {b ? `Send ${dollars(b.giftCents)} gift` : "Send a gift"}
      </button>
      <p className="ev-muted mt-3 text-xs">
        Paid securely with Stripe. {hostName ?? "The host"} receives the full gift amount. Gifts are non-refundable,
        except in case of error or fraud.
      </p>
    </section>
  );
}
