// Cash gift fee breakdown, shown to the guest BEFORE they pay. A word-for-word
// mirror of giftBreakdown() in api/src/lib/gifts/policy.ts (the API computes
// the real charge; this only previews it, from the fee rates the API sends).
// Change both together.

export type FeeConfig = { platformFeeBps: number; stripePercentBps: number; stripeFixedCents: number };

export type GiftBreakdown = {
  giftCents: number;
  platformCents: number;
  cardFeeCents: number;
  totalCents: number;
  applicationFeeCents: number;
};

export function giftBreakdown(giftCents: number, fees: FeeConfig): GiftBreakdown {
  const platformCents = Math.round((giftCents * fees.platformFeeBps) / 10_000);
  const pct = fees.stripePercentBps / 10_000;
  const totalCents = Math.ceil((giftCents + platformCents + fees.stripeFixedCents) / (1 - pct));
  const cardFeeCents = totalCents - giftCents - platformCents;
  return { giftCents, platformCents, cardFeeCents, totalCents, applicationFeeCents: platformCents + cardFeeCents };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
