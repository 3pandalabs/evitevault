import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { adminStanding, hostIdentity } from "../testMode/index.js";
import { featureMode, videoInvitesVisibleTo, type FeatureMode } from "../videoInvites/policy.js";
import { giftsStripeConfigured, type StripeMode } from "./stripe.js";
import { giftStripeMode, type AccountStatus } from "./policy.js";

// CASH_GIFTS = on | admins | off, the same switch shape as VIDEO_INVITES
// (featureMode / videoInvitesVisibleTo are generic). In `admins` only real
// admins and their test hosts see or use gifts; everyone else gets exactly
// "off" (host routes 404, the card renders nothing, the public page offers no
// gift).

export function giftsMode(): FeatureMode {
  return featureMode(process.env.CASH_GIFTS);
}

/** Whether this signed-in account sees and can use cash gifts (server-side). */
export async function giftsVisible(userId: string): Promise<boolean> {
  const mode = giftsMode();
  if (mode === "off") return false;
  if (mode === "on") return true;
  return videoInvitesVisibleTo(mode, await adminStanding(userId));
}

/**
 * Which Stripe mode a host's gifts run in: TEST unless GIFTS_STRIPE_MODE=live,
 * and always TEST for an admin testing as host or a test host (never live
 * money). Rule in policy.ts `giftStripeMode` (tested).
 */
export async function hostStripeMode(hostId: string): Promise<StripeMode> {
  return giftStripeMode(process.env.GIFTS_STRIPE_MODE, (await hostIdentity(hostId)).testMode);
}

export type HostAccount = { mode: StripeMode; accountId: string | null; status: AccountStatus; configured: boolean };

/** The host's connected account for the Stripe mode they are in right now. */
export async function hostAccount(hostId: string): Promise<HostAccount> {
  const mode = await hostStripeMode(hostId);
  const [u] = await db
    .select({
      live: users.stripeAccountId,
      liveStatus: users.stripeAccountStatus,
      test: users.stripeTestAccountId,
      testStatus: users.stripeTestAccountStatus,
    })
    .from(users)
    .where(eq(users.id, hostId))
    .limit(1);
  const accountId = (mode === "live" ? u?.live : u?.test) ?? null;
  const status = ((mode === "live" ? u?.liveStatus : u?.testStatus) as AccountStatus | null) ?? (accountId ? "needs_info" : "none");
  return { mode, accountId, status, configured: giftsStripeConfigured(mode) };
}

/** Writes a fresh status for whichever host owns this account id (live or test). */
export async function saveAccountStatus(accountId: string, live: boolean, status: AccountStatus): Promise<void> {
  if (live) {
    await db.update(users).set({ stripeAccountStatus: status }).where(eq(users.stripeAccountId, accountId));
  } else {
    await db.update(users).set({ stripeTestAccountStatus: status }).where(eq(users.stripeTestAccountId, accountId));
  }
}

/**
 * Can a guest send a gift for this event right now? Feature on (or admins and
 * the host is an admin / their test host), gifts switched on for the event,
 * and the host's account ready in their Stripe mode.
 */
export async function eventAcceptsGifts(event: { hostId: string; giftsEnabled: boolean }): Promise<HostAccount | null> {
  const mode = giftsMode();
  if (mode === "off" || !event.giftsEnabled) return null;
  if (mode === "admins" && !videoInvitesVisibleTo(mode, await adminStanding(event.hostId))) return null;
  const account = await hostAccount(event.hostId);
  if (!account.configured || !account.accountId || account.status !== "ready") return null;
  return account;
}
