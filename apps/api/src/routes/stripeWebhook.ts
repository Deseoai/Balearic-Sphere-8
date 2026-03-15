import Stripe from "stripe";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import {
  addCreditTransaction,
  hasProcessedWebhookKey,
  markWebhookKeyProcessed,
  sumCreditBalance
} from "../store/index.js";

const creditPackages = [
  { id: "starter", label: "Starter", credits: 120, priceEur: 19 },
  { id: "growth", label: "Growth", credits: 360, priceEur: 49 },
  { id: "circle", label: "Circle", credits: 900, priceEur: 99 }
] as const;

// Must be registered via app.register() for encapsulated raw body parsing
export async function registerStripeWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Scoped raw body parser — Stripe signature verification requires the raw Buffer
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post("/v1/webhooks/stripe", async (request, reply) => {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.status(503).send({ error: "stripe_not_configured" });
    }

    const sig = request.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      return reply.status(400).send({ error: "missing_stripe_signature" });
    }

    const rawBody = request.body as Buffer;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      fastify.log.warn({ err }, "Stripe webhook signature verification failed");
      return reply.status(400).send({ error: "invalid_stripe_signature" });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;

      // Same idempotency key as confirm-checkout — prevents double-crediting
      // if frontend also calls confirm-checkout after webhook fires
      const idempotencyKey = `stripe:${sessionId}`;
      if (await hasProcessedWebhookKey(idempotencyKey)) {
        return reply.send({ received: true, status: "already_credited" });
      }

      if (session.payment_status !== "paid") {
        fastify.log.info({ sessionId, paymentStatus: session.payment_status }, "Stripe webhook: skipping unpaid session");
        return reply.send({ received: true, status: "payment_not_completed" });
      }

      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId as "starter" | "growth" | "circle" | undefined;
      const userEmail = session.metadata?.userEmail ?? session.customer_email ?? "";

      if (!userId || !packageId) {
        fastify.log.error({ sessionId, metadata: session.metadata }, "Stripe webhook: missing metadata");
        return reply.status(400).send({ error: "missing_session_metadata" });
      }

      const pkg = creditPackages.find(p => p.id === packageId);
      if (!pkg) {
        fastify.log.error({ packageId }, "Stripe webhook: unknown package");
        return reply.status(400).send({ error: "unknown_package" });
      }

      await markWebhookKeyProcessed(idempotencyKey);

      const now = new Date().toISOString();
      const tx = await addCreditTransaction({
        id: randomUUID(),
        userId,
        type: "purchase",
        amount: pkg.credits,
        reason: `Credit package: ${pkg.label} (€${pkg.priceEur}) — Stripe Webhook`,
        createdAt: now
      });

      const balance = await sumCreditBalance(userId);

      await emitEventHub({
        event: "credits.transaction.created",
        data: {
          transactionId: tx.id,
          userId: tx.userId,
          amount: tx.amount,
          type: tx.type,
          source: "stripe_webhook",
          reason: tx.reason,
          createdAt: tx.createdAt
        }
      });

      await emitEmailAlert({
        event: "email.credits.purchase.created",
        data: {
          notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          userId,
          userEmail,
          packageId: pkg.id,
          packageLabel: pkg.label,
          credits: pkg.credits,
          priceEur: pkg.priceEur,
          transactionId: tx.id,
          createdAt: now,
          via: "stripe_webhook"
        }
      });

      fastify.log.info(
        { sessionId, userId, credits: pkg.credits, balance },
        "Stripe webhook: credits added successfully"
      );
    }

    return reply.send({ received: true });
  });
}
