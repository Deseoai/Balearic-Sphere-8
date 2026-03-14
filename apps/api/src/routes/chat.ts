import type { ChatThreadRecord, UserAccountRecord } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { hasMemberWorkspaceAccess, requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import {
  addCreditTransaction,
  countUnreadMessages,
  getChatThreadById,
  getDirectChatThreadByUsers,
  getUserByEmail,
  getUserById,
  getUserVipStatus,
  incrementSignalScore,
  listChatMessages,
  listChatThreadsByUser,
  saveChatMessage,
  saveChatThread,
  sumCreditBalance
} from "../store/index.js";

const openThreadSchema = z.object({
  targetEmail: z.string().email(),
  openingMessage: z.string().min(1).max(1800).optional()
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000)
});

const threadQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(120).optional()
});

const messageQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).optional()
});

const THREAD_OPEN_COST = 12;
const THREAD_OPEN_COST_VIP = 24; // VIP members cost double

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

function isParticipant(thread: ChatThreadRecord, userId: string): boolean {
  return thread.participantA === userId || thread.participantB === userId;
}

function peerUserIdFor(thread: ChatThreadRecord, userId: string): string {
  return thread.participantA === userId ? thread.participantB : thread.participantA;
}

const unreadQuerySchema = z.object({
  since: z.string().datetime().optional()
});

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/chat/unread-count", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = unreadQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const since = parsed.data.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const count = await countUnreadMessages(session.userId, since);
    return reply.send({ count });
  });

  app.get("/v1/chat/threads", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = threadQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsed.error.flatten()
      });
    }

    const rows = await listChatThreadsByUser(session.userId);
    const items = await Promise.all(
      rows.slice(0, parsed.data.limit ?? 60).map(async (thread) => {
        const peerId = peerUserIdFor(thread, session.userId);
        const peer = await getUserById(peerId);
        return {
          ...thread,
          peer: peer
            ? {
                userId: peer.userId,
                email: peer.email,
                displayName: peer.displayName,
                role: peer.role,
                accessLevel: peer.accessLevel
              }
            : {
                userId: peerId,
                email: "",
                displayName: "Member",
                role: "member",
                accessLevel: "curated"
              }
        };
      })
    );

    return reply.send({ items });
  });

  app.post("/v1/chat/threads/open", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = openThreadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const target = await getUserByEmail(parsed.data.targetEmail);
    if (!target) {
      return reply.status(404).send({
        error: "target_member_not_found",
        message: "No member account found for this email."
      });
    }

    if (target.userId === session.userId) {
      return reply.status(400).send({ error: "cannot_open_chat_with_self" });
    }

    if (!hasMemberWorkspaceAccess(toSessionLikeUser(target))) {
      return reply.status(403).send({
        error: "target_member_not_ready",
        message: "This member is not available for direct chat yet."
      });
    }

    const existing = await getDirectChatThreadByUsers({
      userA: session.userId,
      userB: target.userId
    });

    if (existing) {
      return reply.send({
        status: "existing_thread",
        chargedCredits: 0,
        item: existing
      });
    }

    const isVipTarget = await getUserVipStatus(target.userId);
    const threadCost = isVipTarget ? THREAD_OPEN_COST_VIP : THREAD_OPEN_COST;

    const balanceBefore = await sumCreditBalance(session.userId);
    if (balanceBefore < threadCost) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: threadCost,
        balance: balanceBefore,
        isVipTarget: isVipTarget
      });
    }

    const now = new Date().toISOString();
    const opened = await saveChatThread({
      id: randomUUID(),
      kind: "direct",
      participantA: session.userId,
      participantB: target.userId,
      openedBy: session.userId,
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_unlock",
      amount: -threadCost,
      reason: `Open chat thread${isVipTarget ? " (VIP)" : ""} with ${target.email}`,
      createdAt: now
    });

    let firstMessageId: string | null = null;
    if (parsed.data.openingMessage) {
      const first = await saveChatMessage({
        id: randomUUID(),
        threadId: opened.id,
        senderUserId: session.userId,
        content: parsed.data.openingMessage.trim(),
        createdAt: now
      });
      firstMessageId = first.id;
    }

    await emitEventHub({
      event: "chat.thread.opened",
      data: {
        threadId: opened.id,
        openedBy: session.userId,
        openerEmail: session.email,
        peerUserId: target.userId,
        peerEmail: target.email,
        chargedCredits: THREAD_OPEN_COST,
        createdAt: now
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
      event: "email.chat.thread.opened",
      data: {
        notifyEmail: target.email,
        adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        threadId: opened.id,
        openedBy: session.userId,
        openerEmail: session.email,
        peerUserId: target.userId,
        peerEmail: target.email,
        firstMessageId
      }
    });

    await incrementSignalScore(session.userId, 2);

    const balanceAfter = await sumCreditBalance(session.userId);

    return reply.status(201).send({
      status: "thread_opened",
      chargedCredits: threadCost,
      isVipTarget,
      balance: balanceAfter,
      item: opened
    });
  });

  app.get("/v1/chat/threads/:id/messages", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsedQuery = messageQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const { id } = request.params as { id: string };
    const thread = await getChatThreadById(id);
    if (!thread) {
      return reply.status(404).send({ error: "chat_thread_not_found" });
    }

    if (!isParticipant(thread, session.userId)) {
      return reply.status(403).send({ error: "forbidden_chat_scope" });
    }

    const items = await listChatMessages({
      threadId: id,
      limit: parsedQuery.data.limit
    });

    return reply.send({
      thread,
      items
    });
  });

  app.post("/v1/chat/threads/:id/messages", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const { id } = request.params as { id: string };
    const thread = await getChatThreadById(id);
    if (!thread) {
      return reply.status(404).send({ error: "chat_thread_not_found" });
    }

    if (!isParticipant(thread, session.userId)) {
      return reply.status(403).send({ error: "forbidden_chat_scope" });
    }

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const createdAt = new Date().toISOString();
    const message = await saveChatMessage({
      id: randomUUID(),
      threadId: thread.id,
      senderUserId: session.userId,
      content: parsed.data.content.trim(),
      createdAt
    });

    const peerId = peerUserIdFor(thread, session.userId);
    const peer = await getUserById(peerId);

    await emitEventHub({
      event: "chat.message.sent",
      data: {
        threadId: thread.id,
        messageId: message.id,
        senderUserId: message.senderUserId,
        senderEmail: session.email,
        receiverUserId: peerId,
        receiverEmail: peer?.email ?? "",
        createdAt: message.createdAt
      }
    });

    if (peer?.email) {
      await emitEmailAlert({
        event: "email.chat.message.sent",
        data: {
          notifyEmail: peer.email,
          threadId: thread.id,
          messageId: message.id,
          senderUserId: message.senderUserId,
          senderEmail: session.email,
          createdAt: message.createdAt
        }
      });
    }

    return reply.status(201).send({
      item: message
    });
  });
}
