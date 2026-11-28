// Potluck / sign-up list (migration 0015). The host lists items with a
// quantity ("2 x salad"); a guest (by invite token) claims some of what is
// left. Pure rules, tested in potluck.test.ts; the route re-checks them inside
// a transaction with the item row locked, so two guests cannot both take the
// last one.

export const MAX_ITEMS = 50;

export type ClaimInput = {
  itemQuantity: number;
  /** Everyone's claims on this item, INCLUDING this guest's current one. */
  totalClaimed: number;
  /** This guest's current claim on the item (0 if none). */
  mine: number;
  /** What the guest wants their claim to become (0 = release it). */
  wanted: number;
};

export type ClaimProblem = "invalid_quantity" | "not_enough_left";

export function remaining(itemQuantity: number, totalClaimed: number): number {
  return Math.max(0, itemQuantity - totalClaimed);
}

export function claimProblem(i: ClaimInput): ClaimProblem | null {
  if (!Number.isInteger(i.wanted) || i.wanted < 0 || i.wanted > 100) return "invalid_quantity";
  // Releasing (or reducing) is always allowed, even when the host has since
  // lowered the quantity below what was claimed.
  if (i.wanted <= i.mine) return null;
  const others = i.totalClaimed - i.mine;
  return i.wanted + others > i.itemQuantity ? "not_enough_left" : null;
}

/** First names only on the public list (same rule as the attendee list). */
export function claimerLabel(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
