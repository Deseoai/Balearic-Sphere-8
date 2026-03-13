import { AccessLevels, AiPromptTypes } from "@mallorca/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { emitEmailAlert, emitEventHub, emitRewardEvent } from "../lib/n8nEvents.js";
import {
  applyReviewedApplicationCallback,
  applyReviewedUpgradeCallback,
  completeAiRequest,
  getAccessRequestById,
  getAiRequestById,
  getUserByEmail,
  getUserById,
  hasProcessedEventId,
  incrementSignalScore,
  issueActivityCredits,
  markEventIdProcessed,
  recalculateTrustScore,
  saveAiRequest,
  setUserRoleAndAccessByEmail
} from "../store/index.js";

function requireSharedKey(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!env.MBH_APP_SHARED_KEY) {
    return true;
  }

  const key = request.headers["x-api-key"];
  if (typeof key !== "string" || key !== env.MBH_APP_SHARED_KEY) {
    void reply.status(401).send({ error: "invalid_callback_key" });
    return false;
  }
  return true;
}

const applicationReviewedSchema = z.object({
  event: z.literal("application.reviewed"),
  eventId: z.string().min(8),
  emittedAt: z.string(),
  source: z.string().optional(),
  data: z.object({
    applicationId: z.string().min(3),
    status: z.enum(["accepted", "rejected", "waitlisted", "on_hold", "onhold"]),
    email: z.string().email().optional(),
    humanScore: z.number().min(0).max(100).optional(),
    recommendedAccess: z.enum(AccessLevels).optional(),
    recommendedAccessLevel: z.enum(AccessLevels).optional(),
    adminNotes: z.string().optional(),
    reviewedAt: z.string().optional(),
    reviewedBy: z.string().optional()
  })
});

const upgradeReviewedSchema = z.object({
  event: z.literal("upgrade.reviewed"),
  eventId: z.string().min(8),
  emittedAt: z.string(),
  source: z.string().optional(),
  data: z.object({
    requestId: z.string().min(3),
    status: z.enum(["approved", "rejected", "waitlisted", "on_hold", "onhold"]),
    reason: z.string().optional(),
    reviewedAt: z.string().optional(),
    reviewedBy: z.string().optional()
  })
});

const aiCompletedSchema = z.object({
  event: z.literal("ai.request.completed"),
  eventId: z.string().min(8),
  emittedAt: z.string(),
  source: z.string().optional(),
  data: z.object({
    aiRequestId: z.string().min(3),
    userId: z.string().min(3),
    promptType: z.enum(AiPromptTypes),
    prompt: z.string().min(1),
    responseSummary: z.string().min(1),
    model: z.string().min(1),
    completedAt: z.string().optional()
  })
});

function normalizeApplicationStatus(
  value: "accepted" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "accepted" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

function normalizeUpgradeStatus(
  value: "approved" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "approved" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

export async function registerCallbackRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/callbacks/application-reviewed", async (request, reply) => {
    if (!requireSharedKey(request, reply)) return;
    const parsed = applicationReviewedSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    if (await hasProcessedEventId(parsed.data.eventId)) {
      return reply.send({ status: "duplicate_ignored" });
    }

    const normalizedStatus = normalizeApplicationStatus(parsed.data.data.status);
    const reviewed = await applyReviewedApplicationCallback({
      applicationId: parsed.data.data.applicationId,
      status: normalizedStatus,
      humanScore: parsed.data.data.humanScore,
      recommendedAccessLevel:
        parsed.data.data.recommendedAccessLevel ?? parsed.data.data.recommendedAccess,
      adminNotes: parsed.data.data.adminNotes,
      reviewedAt: parsed.data.data.reviewedAt ?? parsed.data.emittedAt,
      reviewedBy: parsed.data.data.reviewedBy ?? "notion-review"
    });

    const email = parsed.data.data.email ?? reviewed.email;
    if (email) {
      const isAccepted = reviewed.status === "accepted";
      const isOnHold = reviewed.status === "waitlisted";
      await setUserRoleAndAccessByEmail({
        email,
        role: isAccepted ? "member" : "applicant",
        accessLevel: isAccepted ? reviewed.recommendedAccessLevel : "explorer",
        verificationStatus: isAccepted ? "verified" : isOnHold ? "pending" : "rejected"
      });

      await emitEmailAlert({
        source: "app-api",
        event: "email.application.reviewed",
        data: {
          notifyEmail: email,
          adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          applicationId: reviewed.id,
          userEmail: email,
          userName: reviewed.name,
          status: reviewed.status,
          reviewedBy: parsed.data.data.reviewedBy ?? "notion-review",
          reviewedAt: parsed.data.data.reviewedAt ?? parsed.data.emittedAt,
          recommendedAccessLevel: reviewed.recommendedAccessLevel
        }
      });

      if (isAccepted) {
        const acceptedUser = await getUserByEmail(email);
        if (acceptedUser) {
          await incrementSignalScore(acceptedUser.userId, 15); // welcome signal
          await recalculateTrustScore(acceptedUser.userId); // recalculate trust with new verification_status
        }
      }
    }

    // Referral reward: if application was accepted and had a referral code, reward the referrer
    if (reviewed.status === "accepted" && reviewed.referralCode) {
      const referrer = await getUserByEmail(reviewed.referralCode).catch(() => undefined);
      if (referrer) {
        const tx = await issueActivityCredits({
          userId: referrer.userId,
          type: "referral_reward",
          amount: 50,
          reason: `Referral reward: ${reviewed.email} joined the network`
        });
        if (tx.amount > 0) {
          const rewardData = {
            transactionId: tx.id,
            userId: referrer.userId,
            userEmail: referrer.email,
            amount: tx.amount,
            type: tx.type,
            reason: tx.reason,
            createdAt: tx.createdAt
          };
          await emitEventHub({ event: "credits.reward.issued", data: rewardData });
          await emitRewardEvent({ event: "credits.reward.issued", data: rewardData });
        }
      }
    }

    await markEventIdProcessed(parsed.data.eventId);

    return reply.send({
      status: "accepted",
      item: reviewed
    });
  });

  app.post("/v1/callbacks/upgrade-reviewed", async (request, reply) => {
    if (!requireSharedKey(request, reply)) return;
    const parsed = upgradeReviewedSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    if (await hasProcessedEventId(parsed.data.eventId)) {
      return reply.send({ status: "duplicate_ignored" });
    }

    const normalizedStatus = normalizeUpgradeStatus(parsed.data.data.status);

    const reviewed = await applyReviewedUpgradeCallback({
      requestId: parsed.data.data.requestId,
      status: normalizedStatus === "approved" ? "approved" : normalizedStatus === "rejected" ? "rejected" : "waitlisted",
      reason: parsed.data.data.reason,
      reviewedAt: parsed.data.data.reviewedAt ?? parsed.data.emittedAt,
      reviewedBy: parsed.data.data.reviewedBy ?? "notion-review"
    });

    const account = reviewed.userId ? await getUserById(reviewed.userId) : undefined;
    if (reviewed.status === "approved" && account?.email) {
      await setUserRoleAndAccessByEmail({
        email: account.email,
        role: account.role === "applicant" ? "member" : account.role,
        accessLevel: "private_circle_eligible",
        verificationStatus: "verified"
      });
    }

    if (account?.email) {
      await emitEmailAlert({
        source: "app-api",
        event: "email.circle.access.reviewed",
        data: {
          notifyEmail: account.email,
          adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          requestId: reviewed.id,
          userId: reviewed.userId,
          userEmail: account.email,
          userName: account.displayName ?? "",
          circle: reviewed.circle,
          status: reviewed.status,
          reviewedBy: parsed.data.data.reviewedBy ?? "notion-review",
          reviewedAt: parsed.data.data.reviewedAt ?? parsed.data.emittedAt
        }
      });
    }

    await markEventIdProcessed(parsed.data.eventId);

    return reply.send({
      status: "accepted",
      item: reviewed
    });
  });

  app.post("/v1/callbacks/ai-completed", async (request, reply) => {
    if (!requireSharedKey(request, reply)) return;
    const parsed = aiCompletedSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    if (await hasProcessedEventId(parsed.data.eventId)) {
      return reply.send({ status: "duplicate_ignored" });
    }

    if (!(await getAiRequestById(parsed.data.data.aiRequestId))) {
      await saveAiRequest({
        id: parsed.data.data.aiRequestId,
        userId: parsed.data.data.userId,
        promptType: parsed.data.data.promptType,
        prompt: parsed.data.data.prompt,
        status: "running",
        createdAt: parsed.data.emittedAt
      });
    }

    const completed = await completeAiRequest({
      id: parsed.data.data.aiRequestId,
      responseSummary: parsed.data.data.responseSummary,
      model: parsed.data.data.model,
      completedAt: parsed.data.data.completedAt ?? parsed.data.emittedAt
    });

    await markEventIdProcessed(parsed.data.eventId);

    return reply.send({
      status: "accepted",
      item: completed
    });
  });
}
