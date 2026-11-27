import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { users, videoInvites } from "../db/schema.js";
import { env } from "../env.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { tierAvailable } from "../lib/videoInvites/generate.js";
import {
  ATTESTATION_TEXT,
  canTransition,
  clampVariant,
  cleanScript,
  cleanTextLines,
  estimatedSeconds,
  FREE_SIMPLE_PER_DAY,
  freeLimitReached,
  hostView,
  MAX_SCRIPT_CHARS,
  OCCASION_LABELS,
  priceCents,
  routeStripeEvent,
  scriptProblem,
  TEXT_LINE_MAX,
  textLinesProblem,
  VARIANT_COUNT,
  VIDEO_INVITE_OCCASIONS,
  VIDEO_INVITE_TIERS,
  type VideoInviteStatus,
  type VideoInviteTier,
} from "../lib/videoInvites/policy.js";
import { createCheckoutSession, stripeConfigured, verifyStripeSignature } from "../lib/videoInvites/stripe.js";
import { videoInvitesVisible } from "../lib/videoInvites/access.js";
import { routeGiftEvent } from "../lib/gifts/policy.js";
import { applyGiftEvent } from "../lib/gifts/webhook.js";

/** Every configured Stripe webhook signing secret (live/test, platform/Connect). */
function webhookSecrets(): string[] {
  return [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    process.env.STRIPE_TEST_WEBHOOK_SECRET,
    process.env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET,
  ].filter((s): s is string => Boolean(s));
}
import { hostIdentity } from "../lib/testMode/index.js";
import { chargeCents, isUndeliverableEmail } from "../lib/testMode/policy.js";
import { extForType, isAllowedImageType, presignDownload, presignUpload, videoPhotoKey } from "../plugins/r2.js";

// Video invites (lib/videoInvites/policy.ts has the rules). Off unless
// VIDEO_INVITES=on: every host route answers 404 then, so the feature is
// invisible. A tier is available when it can be made here (Simple: ffmpeg;
// Pro: Google or fal) AND, if it costs money, Stripe is configured.

function prices(): Record<VideoInviteTier, number> {
  return {
    simple: priceCents("simple", env.VIDEO_INVITE_PRICE_SIMPLE_CENTS),
    pro: priceCents("pro", env.VIDEO_INVITE_PRICE_PRO_CENTS),
  };
}

function availability(): Record<VideoInviteTier, boolean> {
  const p = prices();
  const ok = (tier: VideoInviteTier) => tierAvailable(tier) && (p[tier] === 0 || stripeConfigured());
  return { simple: ok("simple"), pro: ok("pro") };
}

const line = (max: number) => z.string().max(max * 4).nullish();

const checkoutBody = z.object({
  tier: z.enum(VIDEO_INVITE_TIERS),
  occasion: z.enum(VIDEO_INVITE_OCCASIONS),
  // Pro: what the photo says.
  script: z.string().max(2000).nullish(),
  // Simple: the lines written on the template clip.
  lines: z
    .object({
      kicker: line(TEXT_LINE_MAX.kicker),
      headline: line(TEXT_LINE_MAX.headline),
      when: line(TEXT_LINE_MAX.when),
      where: line(TEXT_LINE_MAX.where),
    })
    .nullish(),
  // Simple: which of the occasion's template clips (1..5), and the narrator's
  // "message to read out" (optional; same rules and cap as a Pro script).
  variant: z.number().int().min(1).max(VARIANT_COUNT).optional(),
  narration: z.string().max(2000).nullish(),
  photoKey: z.string().max(300).nullish(),
  attested: z.boolean().optional(),
});

export async function videoInviteRoutes(app: FastifyInstance) {
  app.register(async (host) => {
    host.addHook("onRequest", requireAuth);
    // Off, or VIDEO_INVITES=admins and the caller isn't a real admin (or one
    // of their test hosts): 404, exactly as if the feature didn't exist.
    host.addHook("onRequest", async (req, reply) => {
      if (!req.userId) return;
      if (!(await videoInvitesVisible(req.userId))) return reply.code(404).send({ error: "not_found" });
    });

    // Config for the card + the event's latest order (cancelled ones skipped).
    host.get(
      "/events/:eventId/video-invite",
      { schema: { params: z.object({ eventId: z.string().uuid() }) } },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;
        const [order] = await db
          .select()
          .from(videoInvites)
          .where(and(eq(videoInvites.eventId, eventId), ne(videoInvites.status, "cancelled")))
          .orderBy(desc(videoInvites.createdAt))
          .limit(1);
        const tiers = availability();
        // In test mode the card shows what will actually be charged (50 cents).
        const { testMode } = await hostIdentity(req.userId!);
        const real = prices();
        return {
          available: tiers.simple || tiers.pro,
          tiers,
          prices: { simple: chargeCents(real.simple, testMode), pro: chargeCents(real.pro, testMode) },
          testMode,
          occasions: VIDEO_INVITE_OCCASIONS.map((id) => ({ id, label: OCCASION_LABELS[id] })),
          maxScriptChars: MAX_SCRIPT_CHARS,
          variants: VARIANT_COUNT,
          lineMax: TEXT_LINE_MAX,
          freePerDay: FREE_SIMPLE_PER_DAY,
          attestationText: ATTESTATION_TEXT,
          order: order
            ? {
                id: order.id,
                tier: order.tier,
                occasion: order.occasion,
                script: order.script,
                lines: order.textLines ?? null,
                variant: order.variant,
                narration: order.narration,
                state: hostView(order.status as VideoInviteStatus),
                createdAt: order.createdAt,
                videoUrl: order.status === "ready" && order.videoKey ? await presignDownload(order.videoKey) : null,
              }
            : null,
        };
      },
    );

    // Pro tier: the host's photo goes straight to R2, like the cover image.
    host.post(
      "/events/:eventId/video-invite/photo/presign-upload",
      {
        schema: {
          params: z.object({ eventId: z.string().uuid() }),
          body: z.object({ contentType: z.string().max(100) }),
        },
      },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        const { contentType } = req.body as { contentType: string };
        if (!(await loadOwnedEvent(eventId, req.userId!, reply))) return;
        if (!isAllowedImageType(contentType)) return reply.code(400).send({ error: "unsupported_content_type" });
        const key = videoPhotoKey(eventId, extForType(contentType));
        return { key, uploadUrl: await presignUpload(key, contentType) };
      },
    );

    // Creates the order. Paid: with a Stripe Checkout session, and nothing is
    // generated until the webhook marks it paid. Free Simple (price 0): queued
    // straight away as `paid`, at most FREE_SIMPLE_PER_DAY per host per day.
    host.post(
      "/events/:eventId/video-invite/checkout",
      { schema: { params: z.object({ eventId: z.string().uuid() }), body: checkoutBody } },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        const body = req.body as z.infer<typeof checkoutBody>;
        const event = await loadOwnedEvent(eventId, req.userId!, reply);
        if (!event) return;
        if (!availability()[body.tier]) return reply.code(503).send({ error: "video_invites_unavailable" });

        let script: string;
        let textLines: ReturnType<typeof cleanTextLines> | null = null;
        let variant: number | null = null;
        let narration: string | null = null;
        if (body.tier === "simple") {
          textLines = cleanTextLines(body.lines ?? {});
          const problem = textLinesProblem(textLines);
          if (problem) return reply.code(400).send({ error: problem });
          script = [textLines.kicker, textLines.headline, textLines.when, textLines.where].filter(Boolean).join(" · ");
          variant = clampVariant(body.variant ?? 1);
          // Read aloud = the same wording rules as a Pro script.
          const spoken = cleanScript(body.narration ?? "");
          if (spoken) {
            const narrationProblem = scriptProblem(spoken);
            if (narrationProblem) return reply.code(400).send({ error: `narration_${narrationProblem.replace("script_", "")}` });
            narration = spoken;
          }
        } else {
          script = cleanScript(body.script ?? "");
          const problem = scriptProblem(script);
          if (problem) return reply.code(400).send({ error: problem });
        }

        let photoKey: string | null = null;
        let attestedAt: Date | null = null;
        if (body.tier === "pro") {
          if (!body.photoKey || !body.photoKey.startsWith(`events/${eventId}/video-photo/`)) {
            return reply.code(400).send({ error: "photo_required" });
          }
          if (body.attested !== true) return reply.code(400).send({ error: "attestation_required" });
          photoKey = body.photoKey;
          attestedAt = new Date();
        }

        // One video at a time per event: a second order while one is being
        // made would charge twice for the same slot on the invitation.
        const [busy] = await db
          .select({ id: videoInvites.id })
          .from(videoInvites)
          .where(and(eq(videoInvites.eventId, eventId), inArray(videoInvites.status, ["paid", "generating"])))
          .limit(1);
        if (busy) return reply.code(409).send({ error: "video_invite_in_progress" });

        const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.userId!)).limit(1);
        if (!me) return reply.code(401).send({ error: "not_authenticated" });

        // Admin testing as host / test host: every paid charge is the 50-cent
        // test price, tagged test_mode=1 (lib/testMode). Free stays free.
        const identity = await hostIdentity(req.userId!);
        const amount = chargeCents(prices()[body.tier], identity.testMode);
        const values = {
          testMode: identity.testMode,
          eventId,
          hostId: req.userId!,
          tier: body.tier,
          occasion: body.occasion,
          script,
          textLines,
          variant,
          narration,
          photoKey,
          attestedAt,
          attestationText: attestedAt ? ATTESTATION_TEXT : null,
          priceCents: amount,
        };

        if (amount === 0) {
          // Free: no Stripe. Rate limited per host per UTC day, counting every
          // free order made today whatever happened to it.
          const dayStart = new Date();
          dayStart.setUTCHours(0, 0, 0, 0);
          const [{ n }] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(videoInvites)
            .where(
              and(
                eq(videoInvites.hostId, req.userId!),
                eq(videoInvites.priceCents, 0),
                gte(videoInvites.createdAt, dayStart),
              ),
            );
          if (freeLimitReached(n)) return reply.code(429).send({ error: "free_daily_limit" });
          await db.insert(videoInvites).values({ ...values, status: "paid", paidAt: new Date() });
          return { queued: true };
        }

        const [order] = await db.insert(videoInvites).values(values).returning();

        const back = `${env.WEB_ORIGIN}/dashboard/events/${eventId}`;
        try {
          const session = await createCheckoutSession({
            orderId: order.id,
            eventId,
            hostEmail: isUndeliverableEmail(me.email) ? null : me.email,
            amountCents: amount,
            testMode: identity.testMode,
            productName: `RsvpVault video invite (${body.tier === "pro" ? "Pro: your photo" : "Simple: our pandas with your text"})`,
            successUrl: `${back}?video=paid`,
            cancelUrl: `${back}?video=cancelled`,
          });
          await db
            .update(videoInvites)
            .set({ stripeSessionId: session.id, updatedAt: new Date() })
            .where(eq(videoInvites.id, order.id));
          return { checkoutUrl: session.url, estimatedSeconds: body.tier === "pro" ? estimatedSeconds(script) : 8 };
        } catch (err) {
          req.log.error(err);
          await db
            .update(videoInvites)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(videoInvites.id, order.id));
          return reply.code(502).send({ error: "checkout_failed" });
        }
      },
    );
  });

  // --- Stripe webhook --------------------------------------------------------
  // Shared org Stripe account: everything not tagged app=rsvpvault is
  // acknowledged and ignored. Signature checked over the exact raw bytes.
  app.post("/webhooks/stripe", { config: { rawBody: true } }, async (req, reply) => {
    const raw = (req as unknown as { rawBody?: string }).rawBody;
    if (!raw) return reply.code(400).send({ error: "missing_raw_body" });
    // One URL, up to four Stripe endpoints pointing at it, each with its own
    // signing secret: the platform endpoint (checkout, charges, disputes), the
    // Connect endpoint (account.updated for hosts' accounts), and their TEST
    // twins for test-mode gifts. Any configured secret that verifies is enough.
    const secrets = webhookSecrets();
    if (secrets.length === 0) return reply.code(503).send({ error: "stripe_not_configured" });
    const sig = req.headers["stripe-signature"];
    const header = typeof sig === "string" ? sig : undefined;
    if (!secrets.some((s) => verifyStripeSignature(raw, header, s))) {
      return reply.code(400).send({ error: "bad_signature" });
    }
    const event = JSON.parse(raw);

    // Cash gifts and Connect accounts first (lib/gifts); anything else falls
    // through to video invites.
    const giftAction = routeGiftEvent(event);
    if (giftAction.kind !== "none") {
      const outcome = await applyGiftEvent(giftAction, req.log);
      return { ok: true, gift: outcome };
    }

    const action = routeStripeEvent(event);
    if (action.kind === "ignore") return { ok: true, ignored: true };

    const [order] = await db.select().from(videoInvites).where(eq(videoInvites.id, action.orderId)).limit(1);
    if (!order) return { ok: true, ignored: true };
    const status = order.status as VideoInviteStatus;

    if (action.kind === "paid") {
      // Idempotent: Stripe retries, and completed + async_succeeded can both arrive.
      if (!canTransition(status, "paid")) return { ok: true, already: status };
      if (action.amountTotal !== null && action.amountTotal !== order.priceCents) {
        req.log.error({ orderId: order.id, amountTotal: action.amountTotal }, "video invite amount mismatch");
        return reply.code(400).send({ error: "amount_mismatch" });
      }
      await db
        .update(videoInvites)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripeSessionId: action.sessionId,
          stripePaymentIntent: action.paymentIntent,
          updatedAt: new Date(),
        })
        .where(and(eq(videoInvites.id, order.id), eq(videoInvites.status, "pending_payment")));
      return { ok: true };
    }

    if (canTransition(status, "cancelled")) {
      await db
        .update(videoInvites)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(videoInvites.id, order.id), eq(videoInvites.status, "pending_payment")));
    }
    return { ok: true };
  });
}
