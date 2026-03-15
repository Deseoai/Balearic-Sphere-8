import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireSession } from "../lib/authSession.js";
import { deletePushToken, getPushTokensByUserId, savePushToken } from "../store/index.js";

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  // Register device push token for the authenticated user
  app.post("/v1/push/register", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = z.object({
      deviceToken: z.string().min(8).max(512),
      platform: z.enum(["ios", "android"])
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    await savePushToken({
      id: randomUUID(),
      userId: session.userId,
      deviceToken: parsed.data.deviceToken,
      platform: parsed.data.platform,
      createdAt: new Date().toISOString()
    });

    return reply.status(201).send({ status: "registered" });
  });

  // Unregister a device push token
  app.delete("/v1/push/register", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = z.object({
      deviceToken: z.string().min(8)
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    await deletePushToken(session.userId, parsed.data.deviceToken);
    return reply.send({ status: "unregistered" });
  });

  // Admin-only: fetch push tokens by userId — used by n8n push workflow
  app.get("/v1/push/tokens/:userId", async (request, reply) => {
    const adminToken =
      typeof request.headers["x-admin-token"] === "string"
        ? request.headers["x-admin-token"].trim()
        : "";

    if (!adminToken || adminToken !== env.ADMIN_API_TOKEN) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { userId } = request.params as { userId: string };
    const tokens = await getPushTokensByUserId(userId);
    return reply.send({ tokens });
  });
}
