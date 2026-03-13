import type { FastifyInstance } from "fastify";
import type { UserAccountRecord } from "@mallorca/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { hasMemberWorkspaceAccess, requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub, emitRewardEvent } from "../lib/n8nEvents.js";
import {
  addAuditEvent,
  addCreditTransaction,
  getDirectChatThreadByUsers,
  getNetworkGraph,
  getUserByEmail,
  getUserById,
  getUserVipStatus,
  incrementSignalScore,
  issueActivityCredits,
  recordProfileView,
  saveChatThread,
  sumCreditBalance
} from "../store/index.js";

const graphQuerySchema = z.object({
  limit: z.coerce.number().min(6).max(80).optional()
});

const introRequestSchema = z.object({
  targetNodeId: z.string().min(5).max(220),
  targetLabel: z.string().min(2).max(180).optional(),
  message: z.string().min(8).max(1200).optional(),
  targetUserId: z.string().uuid().optional(),
  targetEmail: z.string().email().optional(),
  autoOpenChat: z.boolean().optional()
});

const INTRO_UNLOCK_COST = 15;
const INTRO_UNLOCK_COST_VIP = 30; // VIP members cost double

function toSessionLikeUser(user: UserAccountRecord) {
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    accessLevel: user.accessLevel,
    verificationStatus: user.verificationStatus
  };
}

export async function registerNetworkRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/network/graph", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = graphQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsed.error.flatten()
      });
    }

    const graph = await getNetworkGraph({
      userId: session.userId,
      limit: parsed.data.limit
    });

    return reply.send({
      user: {
        userId: session.userId,
        accessLevel: session.accessLevel
      },
      nodes: graph.nodes,
      edges: graph.edges
    });
  });

  app.post("/v1/network/intros", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = introRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    // Resolve target user early for VIP check
    let resolvedTargetUserId = parsed.data.targetNodeId.startsWith("member:")
      ? parsed.data.targetNodeId.replace("member:", "")
      : parsed.data.targetNodeId.startsWith("user:")
        ? parsed.data.targetNodeId.replace("user:", "")
        : "";
    if (parsed.data.targetUserId) resolvedTargetUserId = parsed.data.targetUserId;

    const isVipTarget = resolvedTargetUserId ? await getUserVipStatus(resolvedTargetUserId) : false;
    const introCost = isVipTarget ? INTRO_UNLOCK_COST_VIP : INTRO_UNLOCK_COST;

    const balanceBefore = await sumCreditBalance(session.userId);
    if (balanceBefore < introCost) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: introCost,
        balance: balanceBefore,
        isVipTarget: isVipTarget
      });
    }

    const createdAt = new Date().toISOString();
    const introRequestId = randomUUID();
    let chatThreadId: string | null = null;
    let chatStatus: "opened" | "existing" | "unavailable" | null = null;

    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_unlock",
      amount: -introCost,
      reason: `Intro unlock${isVipTarget ? " (VIP)" : ""}: ${parsed.data.targetLabel || parsed.data.targetNodeId}`,
      createdAt
    });

    // VIP intro reward: target VIP earns 8 credits when contacted
    if (isVipTarget && resolvedTargetUserId) {
      await addCreditTransaction({
        id: randomUUID(),
        userId: resolvedTargetUserId,
        type: "invite_reward",
        amount: 8,
        reason: `VIP intro received from ${session.email}`,
        createdAt
      });
      await emitEventHub({
        event: "credits.vip.intro_received",
        data: {
          recipientId: resolvedTargetUserId,
          senderId: session.userId,
          senderEmail: session.email,
          creditsEarned: 8,
          createdAt
        }
      });
    }

    await addAuditEvent({
      action: "network.intro.requested",
      targetType: "network_intro",
      targetId: introRequestId,
      actor: session.userId,
      metadata: {
        targetNodeId: parsed.data.targetNodeId,
        targetLabel: parsed.data.targetLabel ?? "",
        message: parsed.data.message ?? "",
        chargedCredits: introCost,
        isVipTarget
      }
    });

    let targetUser = resolvedTargetUserId ? await getUserById(resolvedTargetUserId) : undefined;
    if (!targetUser && parsed.data.targetEmail) {
      targetUser = await getUserByEmail(parsed.data.targetEmail);
      if (targetUser) {
        resolvedTargetUserId = targetUser.userId;
      }
    }

    if (
      parsed.data.autoOpenChat &&
      targetUser &&
      targetUser.userId !== session.userId &&
      hasMemberWorkspaceAccess(toSessionLikeUser(targetUser))
    ) {
      const existing = await getDirectChatThreadByUsers({
        userA: session.userId,
        userB: targetUser.userId
      });
      if (existing) {
        chatThreadId = existing.id;
        chatStatus = "existing";
      } else {
        const opened = await saveChatThread({
          id: randomUUID(),
          kind: "direct",
          participantA: session.userId,
          participantB: targetUser.userId,
          openedBy: session.userId,
          status: "active",
          createdAt,
          updatedAt: createdAt
        });
        chatThreadId = opened.id;
        chatStatus = "opened";

        await emitEventHub({
          event: "chat.thread.opened",
          data: {
            threadId: opened.id,
            openedBy: session.userId,
            openerEmail: session.email,
            peerUserId: targetUser.userId,
            peerEmail: targetUser.email,
            chargedCredits: 0,
            source: "network_intro_unlock",
            createdAt
          }
        });

        await emitEmailAlert({
          event: "email.chat.thread.opened",
          data: {
            notifyEmail: targetUser.email,
            adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
            threadId: opened.id,
            openedBy: session.userId,
            openerEmail: session.email,
            peerUserId: targetUser.userId,
            peerEmail: targetUser.email,
            firstMessageId: null
          }
        });
      }
    } else if (parsed.data.autoOpenChat) {
      chatStatus = "unavailable";
    }

    await emitEventHub({
      event: "intro.requested",
      data: {
        introId: introRequestId,
        requesterId: session.userId,
        targetUserId: resolvedTargetUserId,
        status: "pending",
        creditsSpent: introCost,
        introRequestId,
        userId: session.userId,
        userEmail: session.email,
        targetNodeId: parsed.data.targetNodeId,
        targetLabel: parsed.data.targetLabel ?? "",
        message: parsed.data.message ?? "",
        chargedCredits: introCost,
        isVipTarget,
        createdAt
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
      event: "email.network.intro.requested",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        introRequestId,
        userId: session.userId,
        userEmail: session.email,
        targetNodeId: parsed.data.targetNodeId,
        targetLabel: parsed.data.targetLabel ?? "",
        message: parsed.data.message ?? "",
        chargedCredits: introCost,
        isVipTarget,
        createdAt
      }
    });

    // First-intro bonus: 20cr, idempotent via invite_reward type
    const introBonus = await issueActivityCredits({
      userId: session.userId,
      type: "invite_reward",
      amount: 20,
      reason: "First introduction sent"
    });
    if (introBonus.amount > 0) {
      const bonusData = {
        transactionId: introBonus.id,
        userId: introBonus.userId,
        amount: introBonus.amount,
        type: introBonus.type,
        reason: introBonus.reason,
        createdAt: introBonus.createdAt
      };
      await emitEventHub({ event: "credits.reward.issued", data: bonusData });
      await emitRewardEvent({ event: "credits.reward.issued", data: bonusData });
    }

    await incrementSignalScore(session.userId, 5);

    // Check for milestone
    const updatedUser = await getUserById(session.userId);
    if (updatedUser) {
      const score = updatedUser.signalScore ?? 0;
      const milestones = [25, 50, 75, 100];
      const justHit = milestones.find(m => score >= m && (score - 5) < m);
      if (justHit) {
        await emitEventHub({
          event: "member.signal.milestone",
          data: {
            userId: session.userId,
            email: session.email,
            milestone: justHit,
            score,
            achievedAt: new Date().toISOString()
          }
        });
      }
    }

    const balanceAfter = await sumCreditBalance(session.userId);

    return reply.status(201).send({
      status: "intro_requested",
      introRequestId,
      chargedCredits: introCost,
      isVipTarget,
      balance: balanceAfter,
      chatThreadId,
      chatStatus,
      nextStep: chatThreadId
        ? "Conversation opened. You can message this contact now."
        : "Our team will review this intro request and notify you."
    });
  });

  // Record a profile view — called when a member opens a node detail in the network map
  app.post("/v1/network/profile-view/:userId", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const { userId: viewedUserId } = request.params as { userId: string };
    if (viewedUserId === session.userId) return reply.send({ ok: true }); // don't count own views

    const isVip = await getUserVipStatus(viewedUserId);
    if (!isVip) return reply.send({ ok: true }); // only track VIP views

    const newCount = await recordProfileView(viewedUserId);

    // Every 10 views → +3 credits for the VIP
    if (newCount > 0 && newCount % 10 === 0) {
      await addCreditTransaction({
        id: randomUUID(),
        userId: viewedUserId,
        type: "invite_reward",
        amount: 3,
        reason: `VIP profile milestone: ${newCount} profile views`,
        createdAt: new Date().toISOString()
      });
      await emitEventHub({
        event: "credits.vip.profile_milestone",
        data: {
          userId: viewedUserId,
          viewCount: newCount,
          creditsEarned: 3,
          achievedAt: new Date().toISOString()
        }
      });
    }

    return reply.send({ ok: true, viewCount: newCount });
  });
}
