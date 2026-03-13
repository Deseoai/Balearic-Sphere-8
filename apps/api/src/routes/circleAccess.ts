import { AccessLevels } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import {
  addCreditTransaction,
  incrementSignalScore,
  listCircleUpgradeRequests,
  saveCircleUpgradeRequest,
  sumCreditBalance
} from "../store/index.js";

const createSchema = z.object({
  circle: z.string().min(2).max(120),
  currentAccess: z.enum(AccessLevels).optional(),
  reason: z.string().min(10).max(1200),
  aiSuitability: z.number().min(0).max(100).optional()
});

const CIRCLE_REQUEST_FEE = 12;

export async function registerCircleAccessRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/circle-access-requests", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = request.query as {
      status?: "under_review" | "approved" | "rejected" | "waitlisted" | "on_hold" | "onhold";
    };
    const status = query.status === "on_hold" || query.status === "onhold" ? "waitlisted" : query.status;
    return {
      items: await listCircleUpgradeRequests({
        userId: session.userId,
        status
      })
    };
  });

  app.post("/v1/circle-access-requests", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const balanceBefore = await sumCreditBalance(session.userId);
    if (balanceBefore < CIRCLE_REQUEST_FEE) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: CIRCLE_REQUEST_FEE,
        balance: balanceBefore
      });
    }

    const created = await saveCircleUpgradeRequest({
      id: randomUUID(),
      userId: session.userId,
      circle: parsed.data.circle,
      currentAccess: session.accessLevel,
      status: "under_review",
      aiSuitability: parsed.data.aiSuitability ?? 0,
      reason: parsed.data.reason,
      createdAt: new Date().toISOString()
    });
    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_unlock",
      amount: -CIRCLE_REQUEST_FEE,
      reason: `Circle access request (${created.circle})`,
      createdAt: created.createdAt
    });

    const dispatch = await emitEventHub({
      event: "circle.access.requested",
      data: {
        requestId: created.id,
        userId: created.userId,
        email: session.email,
        circle: created.circle,
        currentAccess: created.currentAccess,
        aiSuitability: created.aiSuitability,
        reason: created.reason,
        status: created.status,
        createdAt: created.createdAt
      }
    });
    await emitEventHub({
      event: "credits.transaction.created",
      data: {
        transactionId: debit.id,
        userId: debit.userId,
        amount: debit.amount,
        type: debit.type,
        source: "spent",
        reason: debit.reason,
        createdAt: debit.createdAt
      }
    });

    await emitEmailAlert({
      event: "email.circle.access.requested",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        requestId: created.id,
        userId: created.userId,
        userEmail: session.email,
        circle: created.circle,
        status: created.status,
        chargedCredits: CIRCLE_REQUEST_FEE,
        aiSuitability: created.aiSuitability,
        reason: created.reason,
        createdAt: created.createdAt
      }
    });

    await incrementSignalScore(session.userId, 3);

    const balanceAfter = await sumCreditBalance(session.userId);

    return reply.status(201).send({
      id: created.id,
      status: created.status,
      dispatch,
      chargedCredits: CIRCLE_REQUEST_FEE,
      balance: balanceAfter
    });
  });
}
