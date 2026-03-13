/**
 * Activity & referral credit rewards
 * Called by n8n automations or admin when users complete qualifying actions.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { requireSession } from "../lib/authSession.js";
import { emitEventHub } from "../lib/n8nEvents.js";
import { getUserById, issueActivityCredits, sumCreditBalance } from "../store/index.js";

const REWARD_TYPES = [
  "referral_reward",
  "activity_reward",
  "invite_reward",
  "contribution_reward",
  "verification_bonus",
] as const;

const issueRewardSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(REWARD_TYPES),
  amount: z.number().int().min(1).max(500),
  reason: z.string().min(2).max(200)
});

/** GET /v1/rewards/balance — returns current credit balance for authenticated user */
export async function registerRewardsRoutes(app: FastifyInstance): Promise<void> {
  // Admin-only: issue activity credits to any user
  app.post("/v1/rewards/issue", async (request, reply) => {
    const adminToken = (request.headers["x-admin-token"] as string | undefined)?.trim();
    const sessionUser = await requireSession(request, reply).catch(() => null);

    const isAdmin =
      (adminToken && adminToken === env.ADMIN_API_TOKEN) ||
      (sessionUser && (sessionUser.role === "admin" || sessionUser.role === "super_admin"));

    if (!isAdmin) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = issueRewardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const { userId, type, amount, reason } = parsed.data;

    const user = await getUserById(userId);
    if (!user) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    const tx = await issueActivityCredits({ userId, type, amount, reason });
    const balance = await sumCreditBalance(userId);

    await emitEventHub({
      event: "credits.reward.issued",
      data: {
        transactionId: tx.id,
        userId,
        userEmail: user.email,
        amount: tx.amount,
        type: tx.type,
        reason: tx.reason,
        balance,
        createdAt: tx.createdAt
      }
    });

    return reply.status(201).send({
      transactionId: tx.id,
      userId,
      type: tx.type,
      amount: tx.amount,
      balance,
      reason: tx.reason
    });
  });

  // Members can view their reward history via credits endpoint, but we add a quick summary
  app.get("/v1/rewards/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const balance = await sumCreditBalance(session.userId);
    return reply.send({
      userId: session.userId,
      balance,
      rewardTypes: {
        referral: { amount: 50, description: "Earned when someone you referred joins the network" },
        firstIntro: { amount: 20, description: "Earned on your first successful introduction" },
        firstListing: { amount: 15, description: "Earned when you publish your first marketplace listing" },
        profileComplete: { amount: 25, description: "Earned when your profile is fully completed" },
        dailyActive: { amount: 5, description: "Earned for active participation" },
      }
    });
  });
}
