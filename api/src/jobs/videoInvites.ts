import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { videoInvites } from "../db/schema.js";
import { env } from "../env.js";
import { generateVideo, tierAvailable } from "../lib/videoInvites/generate.js";
import { afterFailure, isEnabled, STALE_GENERATING_MS } from "../lib/videoInvites/policy.js";
import { putVideo, videoInviteKey } from "../plugins/r2.js";

// Makes video invites, one at a time, inside the API process — the same
// "one interval in the one container" shape as jobs/pendingInvitations.ts.
// Never inline in a request: a Pro clip takes minutes (a Simple template
// render takes seconds, but shares the queue).
//
// Safety properties:
//   - Only `paid` rows are claimed. `paid` is written only by the verified
//     Stripe webhook, or by the checkout route for a FREE Simple order
//     (price 0, rate limited per host), so nothing unpaid is ever generated.
//   - The claim is a conditional UPDATE (status paid -> generating), so two
//     overlapping ticks can't both take the same order.
//   - A row stuck in `generating` (the process died mid-job) is handed back to
//     `paid` after STALE_GENERATING_MS; attempts still count, so it can't loop.
//   - After MAX_GENERATION_ATTEMPTS the order is `failed` with refund_needed,
//     logged loudly, and counted in /metrics until ops refunds it in Stripe.

const EVERY_MS = 30 * 1000;
const FIRST_RUN_MS = 90 * 1000;

let running = false;

export async function runVideoInviteTick(log: (msg: string) => void): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Reclaim work a dead process left half done.
    await db
      .update(videoInvites)
      .set({ status: "paid", updatedAt: new Date() })
      .where(
        and(
          eq(videoInvites.status, "generating"),
          lt(videoInvites.startedAt, new Date(Date.now() - STALE_GENERATING_MS)),
        ),
      );

    const [next] = await db
      .select({ id: videoInvites.id })
      .from(videoInvites)
      .where(eq(videoInvites.status, "paid"))
      .orderBy(asc(videoInvites.paidAt))
      .limit(1);
    if (!next) return;

    const [order] = await db
      .update(videoInvites)
      .set({ status: "generating", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(videoInvites.id, next.id), eq(videoInvites.status, "paid")))
      .returning();
    if (!order) return;

    const attempts = order.attempts + 1;
    try {
      const result = await generateVideo(order);
      const key = videoInviteKey(order.eventId);
      await putVideo(key, result.bytes);
      await db
        .update(videoInvites)
        .set({
          status: "ready",
          videoKey: key,
          provider: result.provider,
          attempts,
          finishedAt: new Date(),
          // Keep the fallback reason for ops (e.g. Google out of credit).
          error: result.errors.length ? result.errors.join(" | ").slice(0, 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(videoInvites.id, order.id));
      log(`video invite ${order.id} ready via ${result.provider}`);
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const next = afterFailure(attempts, order.priceCents);
      await db
        .update(videoInvites)
        .set({
          status: next.status,
          refundNeeded: next.refundNeeded,
          attempts,
          error: message,
          finishedAt: next.status === "failed" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(videoInvites.id, order.id));
      log(
        next.refundNeeded
          ? `VIDEO INVITE FAILED, REFUND NEEDED: order ${order.id} (${order.priceCents} cents, ${order.stripePaymentIntent ?? "no payment intent"}): ${message}`
          : next.status === "failed"
            ? `video invite ${order.id} (free) failed: ${message}`
            : `video invite ${order.id} attempt ${attempts} failed, will retry: ${message}`,
      );
    }
  } finally {
    running = false;
  }
}

export function startVideoInvitesJob(log: (msg: string) => void): void {
  if (!isEnabled(env.VIDEO_INVITES)) return;
  // Simple needs only ffmpeg (in the image); Pro needs Google or fal.
  if (!tierAvailable("simple") && !tierAvailable("pro")) {
    log("video invites: no ffmpeg and no provider (GOOGLE_SA_KEY_B64 / FAL_KEY); job not started");
    return;
  }
  const tick = () => runVideoInviteTick(log).catch((err) => log(`video invite job error: ${String(err)}`));
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), EVERY_MS);
  }, FIRST_RUN_MS);
}
