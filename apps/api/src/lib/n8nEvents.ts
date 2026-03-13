import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { createWebhookSignature } from "./webhookAuth.js";

type DispatchResult =
  | {
      ok: true;
      status: number;
      url: string;
      eventId: string;
      idempotencyKey: string;
      skipped?: false;
    }
  | {
      ok: false;
      status?: number;
      url: string;
      error: string;
      eventId: string;
      idempotencyKey: string;
      skipped?: false;
    }
  | {
      ok: true;
      status: 0;
      url: "";
      eventId: string;
      idempotencyKey: string;
      skipped: true;
      reason: string;
    };

type OutboundPayload = {
  event: string;
  eventId: string;
  emittedAt: string;
  source: "app-api" | "admin-ui" | "auth-api";
  idempotencyKey: string;
  data: Record<string, unknown>;
};

function buildSignedHeaders(payload: OutboundPayload): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-idempotency-key": payload.idempotencyKey,
    "x-timestamp": String(Date.now())
  };

  if (env.N8N_WEBHOOK_SECRET) {
    const timestampMs = Number(headers["x-timestamp"]);
    headers["x-signature"] = createWebhookSignature({
      secret: env.N8N_WEBHOOK_SECRET,
      timestampMs,
      body: payload
    });
  }

  return headers;
}

async function postWebhook(url: string | undefined, payload: OutboundPayload): Promise<DispatchResult> {
  if (!url) {
    return {
      ok: true,
      status: 0,
      url: "",
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      skipped: true,
      reason: "webhook_url_not_configured"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.N8N_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildSignedHeaders(payload),
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        url,
        eventId: payload.eventId,
        idempotencyKey: payload.idempotencyKey,
        error: body ? `http_${response.status}:${body.slice(0, 180)}` : `http_${response.status}`
      };
    }

    return {
      ok: true,
      status: response.status,
      url,
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey
    };
  } catch (error) {
    return {
      ok: false,
      url,
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      error: error instanceof Error ? error.message : "unknown_dispatch_error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function makePayload(input: {
  event: string;
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): OutboundPayload {
  const eventId = input.eventId ?? randomUUID();
  return {
    event: input.event,
    eventId,
    emittedAt: new Date().toISOString(),
    source: input.source ?? "app-api",
    idempotencyKey: input.idempotencyKey ?? eventId,
    data: input.data
  };
}

export async function emitEventHub(input: {
  event: string;
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DispatchResult> {
  const payload = makePayload(input);
  return postWebhook(env.N8N_EVENTS_WEBHOOK_URL, payload);
}

export async function emitHitlApplicationDecision(input: {
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DispatchResult> {
  const payload = makePayload({
    event: "application.reviewed",
    data: input.data,
    source: input.source,
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey
  });
  return postWebhook(env.N8N_HITL_APPLICATION_WEBHOOK_URL, payload);
}

export async function emitHitlUpgradeDecision(input: {
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DispatchResult> {
  const payload = makePayload({
    event: "upgrade.reviewed",
    data: input.data,
    source: input.source,
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey
  });
  return postWebhook(env.N8N_HITL_UPGRADE_WEBHOOK_URL, payload);
}

export async function emitRewardEvent(input: {
  event: string;
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DispatchResult> {
  const payload = makePayload(input);
  return postWebhook(env.N8N_REWARDS_WEBHOOK_URL, payload);
}

export async function emitEmailAlert(input: {
  event: string;
  data: Record<string, unknown>;
  source?: "app-api" | "admin-ui" | "auth-api";
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DispatchResult> {
  const data = {
    ...input.data,
    senderEmail: env.ALERTS_FROM_EMAIL,
    fromEmail: env.ALERTS_FROM_EMAIL
  };

  const payload = makePayload({
    event: input.event,
    data,
    source: input.source ?? "app-api",
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey
  });
  return postWebhook(env.N8N_EMAIL_ALERT_WEBHOOK_URL, payload);
}
