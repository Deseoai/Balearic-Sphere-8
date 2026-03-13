import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireOwnershipOrAdmin, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import { addCreditTransaction, listCreditTransactions, sumCreditBalance } from "../store/index.js";

const creditPackages = [
  {
    id: "starter",
    label: "Starter",
    credits: 120,
    priceEur: 19
  },
  {
    id: "growth",
    label: "Growth",
    credits: 360,
    priceEur: 49
  },
  {
    id: "circle",
    label: "Circle",
    credits: 900,
    priceEur: 99
  }
] as const;

const purchaseSchema = z.object({
  packageId: z.enum(["starter", "growth", "circle"])
});

export async function registerCreditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/credits/packages", async () => ({
    currency: "EUR",
    items: creditPackages
  }));

  app.get("/v1/credits/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    return reply.send({
      userId: session.userId,
      balance: await sumCreditBalance(session.userId),
      transactions: await listCreditTransactions(session.userId)
    });
  });

  app.get("/v1/credits/:userId", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const { userId } = request.params as { userId: string };
    if (!userId) {
      return reply.status(400).send({ error: "missing_user_id" });
    }
    if (!requireOwnershipOrAdmin(session, userId, reply)) return;

    return reply.send({
      userId,
      balance: await sumCreditBalance(userId),
      transactions: await listCreditTransactions(userId)
    });
  });

  app.post("/v1/credits/purchase", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = purchaseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const selected = creditPackages.find((item) => item.id === parsed.data.packageId);
    if (!selected) {
      return reply.status(404).send({ error: "package_not_found" });
    }

    const adminTokenHeader = typeof request.headers["x-admin-token"] === "string" ? request.headers["x-admin-token"].trim() : "";
    const adminOverride = adminTokenHeader.length > 0 && adminTokenHeader === env.ADMIN_API_TOKEN;
    if (env.NODE_ENV === "production" && !adminOverride) {
      return reply.status(403).send({
        error: "payment_provider_required",
        message: "Direct credit purchase is disabled in production until payment verification is integrated."
      });
    }

    const tx = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "purchase",
      amount: selected.credits,
      reason: `Credit package: ${selected.label} (€${selected.priceEur})`,
      createdAt: new Date().toISOString()
    });

    const balance = await sumCreditBalance(session.userId);

    await emitEventHub({
      event: "credits.transaction.created",
      data: {
        transactionId: tx.id,
        userId: tx.userId,
        amount: tx.amount,
        type: tx.type,
        source: "purchase",
        reason: tx.reason,
        createdAt: tx.createdAt
      }
    });

    await emitEmailAlert({
      event: "email.credits.purchase.created",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        userId: session.userId,
        userEmail: session.email,
        packageId: selected.id,
        packageLabel: selected.label,
        credits: selected.credits,
        priceEur: selected.priceEur,
        transactionId: tx.id,
        createdAt: tx.createdAt
      }
    });

    return reply.status(201).send({
      status: "credits_added",
      package: selected,
      transaction: tx,
      balance
    });
  });

  // Stripe checkout session (stub — ready when STRIPE_SECRET_KEY is set)
  app.post("/v1/credits/checkout", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = z.object({ packageId: z.string() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });

    const pkg = creditPackages.find(p => p.id === parsed.data.packageId);
    if (!pkg) return reply.status(404).send({ error: "package_not_found" });

    // Stripe integration ready — API key pending
    return reply.status(503).send({
      error: "stripe_not_configured",
      message: "Stripe payment is being configured. Please contact support to purchase credits.",
      package: pkg,
    });
  });
}
