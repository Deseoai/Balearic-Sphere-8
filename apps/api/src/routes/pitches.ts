import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import {
  addCreditTransaction,
  addTrustBonus,
  countPendingPitches,
  getPitchById,
  getUserById,
  getUserVipStatus,
  incrementSignalScore,
  listPitchesByRecipient,
  savePitch,
  sumCreditBalance,
  updatePitchStatus
} from "../store/index.js";

const PITCH_COST = 25;

const sendPitchSchema = z.object({
  recipientId: z.string().uuid(),
  title: z.string().min(4).max(180),
  summary: z.string().min(20).max(1200),
  deckUrl: z.string().url().optional().or(z.literal("")),
  ask: z.string().min(10).max(600)
});

const pitchDecisionSchema = z.object({
  status: z.enum(["accepted", "declined"])
});

export async function registerPitchRoutes(app: FastifyInstance): Promise<void> {
  // Send a pitch (costs 25cr, recipient must be VIP)
  app.post("/v1/pitches", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = sendPitchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const recipient = await getUserById(parsed.data.recipientId);
    if (!recipient) {
      return reply.status(404).send({ error: "recipient_not_found" });
    }

    const isRecipientVip = await getUserVipStatus(parsed.data.recipientId);
    if (!isRecipientVip) {
      return reply.status(403).send({ error: "recipient_not_vip", message: "Private pitch requests can only be sent to VIP members." });
    }

    if (parsed.data.recipientId === session.userId) {
      return reply.status(400).send({ error: "cannot_pitch_yourself" });
    }

    const balance = await sumCreditBalance(session.userId);
    if (balance < PITCH_COST) {
      return reply.status(402).send({ error: "insufficient_credits", required: PITCH_COST, balance });
    }

    const createdAt = new Date().toISOString();
    const pitchId = randomUUID();

    const pitch = await savePitch({
      id: pitchId,
      senderId: session.userId,
      recipientId: parsed.data.recipientId,
      title: parsed.data.title,
      summary: parsed.data.summary,
      deckUrl: parsed.data.deckUrl || undefined,
      ask: parsed.data.ask,
      creditsCharged: PITCH_COST,
      createdAt
    });

    await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_unlock",
      amount: -PITCH_COST,
      reason: `Private pitch: ${parsed.data.title}`,
      createdAt
    });

    await emitEventHub({
      event: "pitch.sent",
      data: {
        pitchId,
        senderId: session.userId,
        senderEmail: session.email,
        recipientId: parsed.data.recipientId,
        recipientEmail: recipient.email,
        title: parsed.data.title,
        summary: parsed.data.summary,
        ask: parsed.data.ask,
        chargedCredits: PITCH_COST,
        createdAt
      }
    });

    await emitEmailAlert({
      event: "email.pitch.received",
      data: {
        notifyEmail: recipient.email,
        adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        pitchId,
        senderId: session.userId,
        senderEmail: session.email,
        recipientId: parsed.data.recipientId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        ask: parsed.data.ask,
        createdAt
      }
    });

    return reply.status(201).send({
      id: pitch.id,
      status: pitch.status,
      chargedCredits: PITCH_COST,
      balance: await sumCreditBalance(session.userId)
    });
  });

  // Get pitch inbox (VIP members see received pitches)
  app.get("/v1/pitches/inbox", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const isVip = await getUserVipStatus(session.userId);
    if (!isVip && session.role !== "admin" && session.role !== "super_admin") {
      return reply.status(403).send({ error: "vip_required", message: "Pitch inbox is exclusive to VIP members." });
    }

    const pitches = await listPitchesByRecipient(session.userId);
    return { items: pitches };
  });

  // Get pending pitch count (for badge)
  app.get("/v1/pitches/count", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const count = await countPendingPitches(session.userId);
    return { count };
  });

  // Accept or decline a pitch
  app.patch("/v1/pitches/:id", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const { id } = request.params as { id: string };
    const parsed = pitchDecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const pitch = await getPitchById(id);
    await updatePitchStatus(id, parsed.data.status);

    if (parsed.data.status === "accepted" && pitch) {
      await addTrustBonus(session.userId, 2); // VIP gets trust for accepting
      await incrementSignalScore(pitch.senderId, 3); // sender gets small signal for accepted pitch
    }

    return { id, status: parsed.data.status };
  });
}
