"use client";

import { Check, Loader2, Minus, Plus, Utensils } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { claimPotluck } from "@/lib/api/guestExtras";
import type { PublicPotluck } from "@/lib/api/public";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  not_enough_left: "Someone just took the last of that one.",
  invitation_required: "Use your personal invitation link to sign up.",
};

// "What to bring": the host's list; a guest with their personal link claims
// what they'll bring. First names only on the list.
export function PotluckList({ slug, token, initial }: { slug: string; token?: string; initial: PublicPotluck }) {
  const [potluck, setPotluck] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (potluck.items.length === 0) return null;

  async function set(itemId: string, quantity: number) {
    if (!token) return;
    setBusy(itemId);
    setError(null);
    try {
      const r = await claimPotluck(slug, itemId, token, quantity);
      setPotluck(r.potluck);
    } catch (err) {
      setError(ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't save that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ev-surface mt-8 rounded-2xl p-5 shadow-sm sm:p-8">
      <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
        <Utensils className="size-5" style={{ color: "var(--ev-accent)" }} />
        What to bring
      </h2>
      <p className="ev-muted mt-1 text-sm">
        {token ? "Pick something to bring — everyone can see what's covered." : "Open your personal invitation link to sign up for something."}
      </p>
      <ul className="mt-4 divide-y divide-black/5">
        {potluck.items.map((i) => {
          const full = i.remaining === 0 && i.mine === 0;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", full && "line-through opacity-60")}>
                  {i.name}
                  {i.quantity > 1 ? <span className="ev-muted text-sm font-normal"> · {i.quantity} needed</span> : null}
                </p>
                {i.note ? <p className="ev-muted text-xs">{i.note}</p> : null}
                {i.claimedBy.length ? (
                  <p className="ev-muted text-xs">
                    {i.claimedBy.map((c) => (c.quantity > 1 ? `${c.name} ×${c.quantity}` : c.name)).join(", ")}
                  </p>
                ) : null}
              </div>
              {token ? (
                i.mine > 0 ? (
                  <div className="flex items-center gap-1">
                    {i.quantity > 1 ? (
                      <>
                        <button type="button" aria-label="Bring one less" disabled={busy === i.id} onClick={() => set(i.id, i.mine - 1)} className="rounded-full border border-black/15 p-1.5">
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{i.mine}</span>
                        <button type="button" aria-label="Bring one more" disabled={busy === i.id || i.remaining === 0} onClick={() => set(i.id, i.mine + 1)} className="rounded-full border border-black/15 p-1.5 disabled:opacity-40">
                          <Plus className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={busy === i.id} onClick={() => set(i.id, 0)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}>
                        {busy === i.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        You&apos;re bringing it
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy === i.id || full}
                    onClick={() => set(i.id, 1)}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-black/10 px-3 py-1.5 text-sm font-medium hover:border-black/25 disabled:opacity-40"
                  >
                    {busy === i.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    {full ? "Covered" : "I'll bring it"}
                  </button>
                )
              ) : (
                <span className="ev-muted text-xs">{i.remaining === 0 ? "Covered" : `${i.remaining} left`}</span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
