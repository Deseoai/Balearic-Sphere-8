import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "../lib/authSession.js";
import { emitEventHub } from "../lib/n8nEvents.js";
import {
  deleteEliteMessagesBefore,
  getUserEliteStatus,
  listEliteMembers,
  listEliteMessages,
  saveEliteMessage,
  setUserEliteStatus,
} from "../store/index.js";

const MESSAGES_TTL_HOURS = 48;

const ADMIN_ROLES = ["admin", "super_admin"];

async function requireEliteAccess(request: Parameters<typeof requireSession>[0], reply: Parameters<typeof requireSession>[1]): Promise<{ userId: string; email: string; displayName?: string; avatarUrl?: string; role: string } | null> {
  const session = await requireSession(request, reply);
  if (!session) return null;
  const isAdmin = ADMIN_ROLES.includes(session.role);
  if (isAdmin) return session;
  const isElite = await getUserEliteStatus(session.userId);
  if (!isElite) {
    reply.status(403).send({ error: "elite_required", message: "This area is reserved for Elite Circle members." });
    return null;
  }
  return session;
}

export async function registerEliteRoutes(app: FastifyInstance): Promise<void> {
  // List elite members
  app.get("/v1/elite/members", async (request, reply) => {
    const session = await requireEliteAccess(request, reply);
    if (!session) return;
    const members = await listEliteMembers();
    return reply.send({ members });
  });

  // Get elite room messages (auto-cleanup messages older than TTL)
  app.get("/v1/elite/messages", async (request, reply) => {
    const session = await requireEliteAccess(request, reply);
    if (!session) return;
    const cutoff = new Date(Date.now() - MESSAGES_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await deleteEliteMessagesBefore(cutoff);
    const messages = await listEliteMessages(100);
    return reply.send({ messages });
  });

  // Post a message to the elite room
  app.post("/v1/elite/messages", async (request, reply) => {
    const session = await requireEliteAccess(request, reply);
    if (!session) return;

    const parsed = z.object({ content: z.string().min(1).max(2000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });

    const content = parsed.data.content.trim();
    const msg = {
      id: randomUUID(),
      userId: session.userId,
      displayName: session.displayName,
      avatarUrl: (session as { avatarUrl?: string }).avatarUrl,
      content,
    };
    await saveEliteMessage(msg);

    // Detect @mentions and notify mentioned members
    const mentionTokens = [...content.matchAll(/@([\w\u00C0-\u024F\u1E00-\u1EFF-]+)/g)].map(m => m[1].toLowerCase());
    if (mentionTokens.length > 0) {
      const allMembers = await listEliteMembers();
      const senderName = session.displayName ?? session.email;
      for (const token of mentionTokens) {
        const mentioned = allMembers.find(m => {
          const name = (m.displayName ?? "").toLowerCase();
          const firstName = name.split(/\s+/)[0];
          return firstName === token || name.replace(/\s+/g, "") === token;
        });
        if (mentioned && mentioned.userId !== session.userId) {
          await emitEventHub({
            event: "elite.mention.received",
            data: {
              mentionedUserId: mentioned.userId,
              mentionedEmail: mentioned.email,
              mentionedDisplayName: mentioned.displayName ?? "",
              mentionedBy: senderName,
              mentionedByUserId: session.userId,
              messageId: msg.id,
              messagePreview: content.slice(0, 160),
            },
          });
        }
      }
    }

    return reply.status(201).send({ message: { ...msg, createdAt: new Date().toISOString() } });
  });

  // Admin: toggle elite status for a user
  app.patch("/v1/elite/members/:userId", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!ADMIN_ROLES.includes(session.role)) return reply.status(403).send({ error: "admin_required" });

    const { userId } = request.params as { userId: string };
    const parsed = z.object({ isElite: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });

    await setUserEliteStatus(userId, parsed.data.isElite);
    return reply.send({ userId, isElite: parsed.data.isElite });
  });
}
