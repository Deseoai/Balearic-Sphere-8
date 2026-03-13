import type { WebhookEnvelope } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { verifyWebhookSignature } from "../lib/webhookAuth.js";
import { hasProcessedWebhookKey, markWebhookKeyProcessed } from "../store/index.js";

const webhookSchema = z.object({
  event: z.string().min(2),
  eventId: z.string().min(4),
  emittedAt: z.string(),
  data: z.record(z.unknown())
});

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/webhooks/n8n", async (request, reply) => {
    const signature = request.headers["x-signature"] as string | undefined;
    const timestamp = request.headers["x-timestamp"] as string | undefined;
    const idempotencyKey = request.headers["x-idempotency-key"] as string | undefined;

    if (!idempotencyKey) {
      return reply.status(400).send({ error: "missing_idempotency_key" });
    }

    if (await hasProcessedWebhookKey(idempotencyKey)) {
      return reply.status(200).send({ status: "duplicate_ignored" });
    }

    const verified = verifyWebhookSignature({
      secret: env.WEBHOOK_SECRET,
      signatureHeader: signature,
      timestampHeader: timestamp,
      body: request.body ?? {},
      maxSkewSeconds: env.WEBHOOK_MAX_SKEW_SECONDS
    });

    if (!verified.ok) {
      return reply.status(401).send({
        error: "invalid_signature",
        reason: verified.reason
      });
    }

    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_webhook_payload",
        details: parsed.error.flatten()
      });
    }

    const envelope: WebhookEnvelope<Record<string, unknown>> = parsed.data;

    await markWebhookKeyProcessed(idempotencyKey);

    app.log.info(
      {
        event: envelope.event,
        eventId: envelope.eventId,
        idempotencyKey
      },
      "Webhook accepted"
    );

    return reply.status(202).send({ status: "accepted" });
  });
}
