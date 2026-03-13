import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "../lib/authSession.js";
import { addCreditTransaction, applyReferralCode, getOrCreateReferralCode, getUserById, getUserVipStatus } from "../store/index.js";

export async function registerReferralRoutes(app: FastifyInstance): Promise<void> {
  // Get or create the current user's referral code
  app.get("/v1/referrals/my-code", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const isVip = await getUserVipStatus(session.userId);
    const result = await getOrCreateReferralCode(session.userId, isVip);
    return reply.send({
      code: result.code,
      uses: result.uses,
      rewardPerUse: isVip ? 40 : 20,
      isVip,
      referralUrl: `https://balea-sphere8.com/request-access?ref=${result.code}`,
    });
  });

  // Apply a referral code (for a newly registered user)
  app.post("/v1/referrals/apply", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = z.object({ code: z.string().min(4).max(20) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });

    const result = await applyReferralCode(parsed.data.code, session.userId);
    if (!result) return reply.status(400).send({ error: "invalid_or_used_code", message: "This referral code is invalid, expired, or you have already used a referral code." });

    const now = new Date().toISOString();

    // Credit the referrer
    await addCreditTransaction({
      id: randomUUID(),
      userId: result.referrerId,
      type: "referral_reward",
      amount: result.referrerReward,
      reason: `Referral reward: ${result.referrerReward} credits for inviting a new member`,
      createdAt: now,
    });

    // Credit the new user
    await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "invite_reward",
      amount: result.newUserReward,
      reason: "Welcome bonus for joining via referral",
      createdAt: now,
    });

    const referrer = await getUserById(result.referrerId);

    return reply.send({
      success: true,
      creditsAwarded: result.newUserReward,
      referrerName: referrer?.companyName ?? referrer?.displayName ?? "A Balea Sphere member",
    });
  });
}
