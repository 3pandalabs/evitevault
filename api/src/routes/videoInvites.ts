import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { users, videoInvites } from "../db/schema.js";
import { env } from "../env.js";
import { loadOwnedEvent } from "../lib/ownership.js";
import { generationAvailable } from "../lib/videoInvites/generate.js";
import {
  ATTESTATION_TEXT,
  canTransition,
  cleanScript,
  estimatedSeconds,
  hostView,
  isEnabled,
  MAX_SCRIPT_CHARS,
  OCCASION_LABELS,
  priceCents,
  routeStripeEvent,
  scriptProblem,
  VIDEO_INVITE_OCCASIONS,
  VIDEO_INVITE_TIERS,
  type VideoInviteStatus,
  type VideoInviteTier,
} from "../lib/videoInvites/policy.js";
import { createCheckoutSession, stripeConfigured, verifyStripeSignature } from "../lib/videoInvites/stripe.js";
import { extForType, isAllowedImageType, presignDownload, presignUpload, videoPhotoKey } from "../plugins/r2.js";

// Paid video invites (lib/videoInvites/policy.ts has the rules). Off unless
// VIDEO_INVITES=on: every host route answers 404 then, so the feature is
// invisible. On but missing a provider or Stripe: 503 unavailable.

function prices(): Record<VideoInviteTier, number> {
  return {
    simple: priceCents("simple", env.VIDEO_INVITE_PRICE_SIMPLE_CENTS),
    pro: priceCents("pro", env.VIDEO_INVITE_PRICE_PRO_CENTS),
  };
}

function available(): boolean {
  return generationAvailable() && stripeConfigured();
}

const checkoutBody = z.object({
  tier: z.enum(VIDEO_INVITE_TIERS),
  occasion: z.enum(VIDEO_INVITE_OCCASIONS),
  script: z.string().max(2000),
  photoKey: z.string().max(300).nullish(),
  attested: z.boolean().optional(),
});

export async function videoInviteRoutes(app: FastifyInstance) {
  app.register(async (host) => {
    host.addHook("onRequest", requireAuth);
    host.addHook("onRequest", async (_req, reply) => {
      if (!isEnabled(env.VIDEO_INVITES)) return reply.code(404).send({ error: "not_found" });
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
        return {
          available: available(),
          prices: prices(),
          occasions: VIDEO_INVITE_OCCASIONS.map((id) => ({ id, label: OCCASION_LABELS[id] })),
          maxScriptChars: MAX_SCRIPT_CHARS,
          attestationText: ATTESTATION_TEXT,
          order: order
            ? {
                id: order.id,
                tier: order.tier,
                occasion: order.occasion,
                script: order.script,
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

    // Creates the order and its Stripe Checkout session. Nothing is generated
    // here: generation starts only when the webhook marks the order paid.
    host.post(
      "/events/:eventId/video-invite/checkout",
      { schema: { params: z.object({ eventId: z.string().uuid() }), body: checkoutBody } },
      async (req, reply) => {
        const { eventId } = req.params as { eventId: string };
        const body = req.body as z.infer<typeof checkoutBody>;
        const event = await loadOwnedEvent(eventId, req.userId!, reply);
        if (!event) return;
        if (!available()) return reply.code(503).send({ error: "video_invites_unavailable" });

        const script = cleanScript(body.script);
        const problem = scriptProblem(script);
        if (problem) return reply.code(400).send({ error: problem });

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

        const amount = prices()[body.tier];
        const [order] = await db
          .insert(videoInvites)
          .values({
            eventId,
            hostId: req.userId!,
            tier: body.tier,
            occasion: body.occasion,
            script,
            photoKey,
            attestedAt,
            attestationText: attestedAt ? ATTESTATION_TEXT : null,
            priceCents: amount,
          })
          .returning();

        const back = `${env.WEB_ORIGIN}/dashboard/events/${eventId}`;
        try {
          const session = await createCheckoutSession({
            orderId: order.id,
            eventId,
            hostEmail: me.email,
            amountCents: amount,
            productName: `RsvpVault video invite (${body.tier === "pro" ? "Pro: your photo" : "Simple: our pandas"})`,
            successUrl: `${back}?video=paid`,
            cancelUrl: `${back}?video=cancelled`,
          });
          await db
            .update(videoInvites)
            .set({ stripeSessionId: session.id, updatedAt: new Date() })
            .where(eq(videoInvites.id, order.id));
          return { checkoutUrl: session.url, estimatedSeconds: estimatedSeconds(script) };
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
    if (!env.STRIPE_WEBHOOK_SECRET) return reply.code(503).send({ error: "stripe_not_configured" });
    const sig = req.headers["stripe-signature"];
    if (!verifyStripeSignature(raw, typeof sig === "string" ? sig : undefined, env.STRIPE_WEBHOOK_SECRET)) {
      return reply.code(400).send({ error: "bad_signature" });
    }

    const action = routeStripeEvent(JSON.parse(raw));
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
