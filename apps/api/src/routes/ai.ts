import { AiPromptTypes } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import { createWebhookSignature } from "../lib/webhookAuth.js";
import {
  addCreditTransaction,
  completeAiRequest,
  incrementSignalScore,
  listAiRequests,
  saveAiRequest,
  sumCreditBalance
} from "../store/index.js";

const createAiRequestSchema = z.object({
  promptType: z.enum(AiPromptTypes),
  prompt: z.string().min(8).max(4000)
});

const quickConciergeSchema = z.object({
  intent: z.string().min(5).max(800),
  location: z.string().min(2).max(120).optional()
});

const supportAskSchema = z.object({
  message: z.string().min(2).max(1800),
  locale: z.string().max(35).optional(),
  context: z.string().max(2000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1600)
      })
    )
    .max(12)
    .optional()
});

const AI_REQUEST_COST = 8;
const CONCIERGE_COST = 5;

function fallbackSupportAnswer(input: { message: string; locale?: string }): {
  answer: string;
  suggestions: string[];
} {
  const message = input.message.toLowerCase();

  if (message.includes("credit") || message.includes("buy")) {
    return {
      answer:
        "Open \"Credit Plans\" in your workspace to see package sizes and action costs. If checkout is temporarily unavailable, use the Support button and the team can help with manual top-up.",
      suggestions: [
        "Open Credit Plans in workspace",
        "Check action costs before running",
        "Contact support for top-up help"
      ]
    };
  }

  if (message.includes("login") || message.includes("magic")) {
    return {
      answer:
        "Magic link is used for secure sign-in. After that, your session stays active on this device until you log out or the session expires, so your workspace opens directly next time.",
      suggestions: ["Open workspace", "Check your session status card", "Contact support if you switched devices"]
    };
  }

  if (message.includes("map") || message.includes("network")) {
    return {
      answer:
        "The Opportunity Map shows your real activity: listings, AI requests, and circle requests. Select a node, evaluate fit, then use intro unlock when you want to connect through a qualified path.",
      suggestions: ["Select one node", "Unlock intro for the best-fit node", "Publish a listing to expand your map"]
    };
  }

  return {
    answer:
      "I can help with access, credits, intros, circle requests, and AI features. I default to English, and I can also respond in other languages if you prefer.",
    suggestions: [
      "How do I get more qualified intros?",
      "How does circle access work?",
      "What action gives me the highest impact this week?"
    ]
  };
}

async function callSupportWebhook(input: {
  userId: string;
  email: string;
  message: string;
  locale?: string;
  context?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ answer: string; suggestions: string[] } | null> {
  if (!env.N8N_SUPPORT_WEBHOOK_URL) return null;

  const payload = {
    event: "support.assistant.requested",
    eventId: randomUUID(),
    emittedAt: new Date().toISOString(),
    source: "app-api" as const,
    idempotencyKey: randomUUID(),
    data: {
      userId: input.userId,
      userEmail: input.email,
      message: input.message,
      locale: input.locale ?? "",
      context: input.context ?? "",
      history: input.history ?? []
    }
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-idempotency-key": payload.idempotencyKey,
    "x-timestamp": String(Date.now())
  };
  if (env.N8N_WEBHOOK_SECRET) {
    headers["x-signature"] = createWebhookSignature({
      secret: env.N8N_WEBHOOK_SECRET,
      timestampMs: Number(headers["x-timestamp"]),
      body: payload
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.N8N_TIMEOUT_MS);
  try {
    const response = await fetch(env.N8N_SUPPORT_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const answer =
      (typeof body.answer === "string" && body.answer.trim()) ||
      (typeof body.response === "string" && body.response.trim()) ||
      "";
    const suggestions = Array.isArray(body.suggestions)
      ? body.suggestions.filter((item): item is string => typeof item === "string").slice(0, 4)
      : [];
    if (!answer) return null;
    return { answer, suggestions };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/ai/requests", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = request.query as { status?: "queued" | "running" | "completed" | "failed" };
    return {
      items: await listAiRequests({
        userId: session.userId,
        status: query.status
      })
    };
  });

  app.post("/v1/ai/requests", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = createAiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const currentBalance = await sumCreditBalance(session.userId);
    if (currentBalance < AI_REQUEST_COST) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: AI_REQUEST_COST,
        balance: currentBalance
      });
    }

    const created = await saveAiRequest({
      id: randomUUID(),
      userId: session.userId,
      promptType: parsed.data.promptType,
      prompt: parsed.data.prompt,
      status: "queued",
      createdAt: new Date().toISOString()
    });

    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_ai",
      amount: -AI_REQUEST_COST,
      reason: `AI request (${created.promptType})`,
      createdAt: created.createdAt
    });
    const balanceAfter = await sumCreditBalance(session.userId);

    const dispatch = await emitEventHub({
      event: "ai.request.created",
      data: {
        aiRequestId: created.id,
        userId: created.userId,
        userEmail: session.email,
        promptType: created.promptType,
        prompt: created.prompt,
        status: created.status,
        createdAt: created.createdAt
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
      event: "email.ai.request.created",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        userId: session.userId,
        userEmail: session.email,
        aiRequestId: created.id,
        promptType: created.promptType,
        status: created.status,
        createdAt: created.createdAt
      }
    });

    await incrementSignalScore(session.userId, 2);

    return reply.status(201).send({
      id: created.id,
      status: created.status,
      dispatch,
      chargedCredits: AI_REQUEST_COST,
      balance: balanceAfter
    });
  });

  app.post("/v1/ai/concierge", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = quickConciergeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const currentBalance = await sumCreditBalance(session.userId);
    if (currentBalance < CONCIERGE_COST) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: CONCIERGE_COST,
        balance: currentBalance
      });
    }

    const intent = parsed.data.intent.toLowerCase();
    const focus = intent.includes("investor")
      ? "investor and capital nodes"
      : intent.includes("real estate")
        ? "real-estate operators and off-market listings"
        : intent.includes("hospitality")
          ? "hospitality decision makers and premium service providers"
          : "high-fit connectors and active deal rooms";

    const response = [
      `Prioritize ${focus} in ${parsed.data.location ?? "Mallorca"}.`,
      "Unlock 3 high-relevance profiles, then request one qualified intro.",
      "Publish one focused marketplace request to increase visibility."
    ].join(" ");

    const created = await saveAiRequest({
      id: randomUUID(),
      userId: session.userId,
      promptType: "concierge",
      prompt: parsed.data.intent,
      status: "running",
      createdAt: new Date().toISOString()
    });
    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_ai",
      amount: -CONCIERGE_COST,
      reason: "AI concierge request",
      createdAt: created.createdAt
    });

    const completed = await completeAiRequest({
      id: created.id,
      responseSummary: response,
      model: "api-concierge-v1",
      completedAt: new Date().toISOString()
    });

    await emitEventHub({
      event: "ai.request.completed",
      data: {
        aiRequestId: completed?.id ?? created.id,
        userId: created.userId,
        userEmail: session.email,
        promptType: created.promptType,
        prompt: created.prompt,
        responseSummary: response,
        model: "api-concierge-v1",
        completedAt: completed?.completedAt ?? new Date().toISOString()
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
      event: "email.ai.concierge.completed",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        userId: session.userId,
        userEmail: session.email,
        aiRequestId: created.id,
        promptType: created.promptType,
        completedAt: completed?.completedAt ?? new Date().toISOString()
      }
    });

    const balanceAfter = await sumCreditBalance(session.userId);
    return reply.send({
      requestId: created.id,
      response,
      chargedCredits: CONCIERGE_COST,
      balance: balanceAfter
    });
  });

  app.post("/v1/ai/support", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = supportAskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const fromWebhook = await callSupportWebhook({
      userId: session.userId,
      email: session.email,
      message: parsed.data.message,
      locale: parsed.data.locale,
      context: parsed.data.context,
      history: parsed.data.history
    });
    const fallback = fallbackSupportAnswer({
      message: parsed.data.message,
      locale: parsed.data.locale
    });
    const output = fromWebhook ?? fallback;

    await emitEventHub({
      event: "support.assistant.responded",
      data: {
        userId: session.userId,
        userEmail: session.email,
        usedWebhook: Boolean(fromWebhook),
        locale: parsed.data.locale ?? "",
        questionPreview: parsed.data.message.slice(0, 180)
      }
    });

    return reply.send({
      answer: output.answer,
      suggestions: output.suggestions,
      source: fromWebhook ? "n8n-webhook" : "fallback"
    });
  });

  // Search members by industry — returns company names only (privacy)
  app.get("/v1/members/by-industry", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = request.query as { industry?: string };
    if (!query.industry) return reply.send({ companies: [] });
    const { getUsersByIndustry } = await import("../store/index.js");
    const results = await getUsersByIndustry(query.industry.trim().toLowerCase());
    // Return only company names and industries — no personal data
    return reply.send({
      industry: query.industry,
      companies: results.map(u => ({
        company: u.companyName ?? u.displayName ?? "Member",
        industry: u.industry ?? query.industry,
      }))
    });
  });
}
