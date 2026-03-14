import { AiPromptTypes } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config.js";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import { createWebhookSignature } from "../lib/webhookAuth.js";
import {
  addCreditTransaction,
  completeAiRequest,
  getUserById,
  incrementSignalScore,
  listAiRequests,
  listChatThreadsByUser,
  listMarketplaceListings,
  listUsers,
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
  context: z.string().max(8000).optional(),
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

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

async function callOpenAI(input: {
  message: string;
  context: string;
}): Promise<{ answer: string; suggestions: string[] } | null> {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: input.context },
        { role: "user", content: input.message },
      ],
      max_tokens: 900,
      temperature: 0.7,
    });
    const answer = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!answer) return null;
    return { answer, suggestions: [] };
  } catch (err) {
    console.error("[AI Tools] OpenAI error:", err);
    return null;
  }
}

async function buildRichPayload(input: {
  promptType: string;
  prompt: string;
  userId: string;
}): Promise<{ message: string; context: string }> {
  const currentUser = await getUserById(input.userId);
  const userProfile = currentUser
    ? [
        `Name: ${currentUser.displayName ?? "Unknown"}`,
        `Company: ${currentUser.companyName ?? "N/A"}`,
        `Industry: ${currentUser.industry ?? "N/A"}`,
        `Access Level: ${currentUser.accessLevel}`,
        `Verification: ${currentUser.verificationStatus}`,
        `Trust Score: ${currentUser.trustScore ?? 0}`,
        `Signal Score: ${currentUser.signalScore ?? 0}`,
      ].join("\n")
    : "Profile not available";

  const name = currentUser?.displayName ?? "a member";
  const company = currentUser?.companyName ? `at ${currentUser.companyName}` : "(no company set yet)";
  const industry = currentUser?.industry ?? "not specified";
  const trust = currentUser?.trustScore ?? 0;
  const signal = currentUser?.signalScore ?? 0;
  const verification = currentUser?.verificationStatus ?? "none";
  const access = currentUser?.accessLevel ?? "explorer";

  switch (input.promptType) {
    case "matchmaking": {
      const allMembers = await listUsers({ role: "member" });
      const others = allMembers
        .filter(m => m.userId !== input.userId)
        .slice(0, 25)
        .map(m =>
          `• ${m.displayName ?? "Member"}, ${m.companyName ?? "no company"}, industry: ${m.industry ?? "N/A"}, trust: ${m.trustScore ?? 0}`
        )
        .join("\n");
      return {
        message: `I am ${name} ${company}, working in ${industry}. My trust score is ${trust} and signal score is ${signal}. I want to know which members of the Balea Sphere network are the best fit for me to connect with.\n\nHere are the current network members:\n${others || "No other members yet."}\n\nPlease identify my top 3–5 best matches, explain specifically why each one is a good fit for me, and suggest a concrete first approach for each. Be strategic and concise.`,
        context: "You are a member matchmaking expert for Balea Sphere, a private curated business network in Mallorca and the Balearic Islands. Help members find their best-fit connections based on real profile data.",
      };
    }

    case "intro_engine": {
      const targetUser = await getUserById(input.prompt.trim());
      if (!targetUser) {
        return {
          message: `I am ${name} ${company}, working in ${industry}. I want to write a personalised introduction message to a contact in my Balea Sphere network. Please write a warm, professional introduction message I can send directly.`,
          context: "You are an expert at crafting personalised business introduction messages for Balea Sphere, a private business network in the Balearic Islands.",
        };
      }
      return {
        message: `I am ${name} ${company}, working in ${industry} (trust score: ${trust}, access: ${access}). I want to send a personalised introduction message to ${targetUser.displayName ?? "a contact"}, who works at ${targetUser.companyName ?? "their company"} in ${targetUser.industry ?? "their field"} (trust score: ${targetUser.trustScore ?? 0}).\n\nPlease write a warm, specific, and compelling 2–3 paragraph introduction message I can send directly to them. Reference our industries and any obvious synergies. Keep it professional and ready to send.`,
        context: "You are an expert at crafting personalised business introduction messages for Balea Sphere, a private business network in the Balearic Islands.",
      };
    }

    case "profile_optimization": {
      const [listings, threads, aiHistory] = await Promise.all([
        listMarketplaceListings({ postedBy: input.userId }),
        listChatThreadsByUser(input.userId),
        listAiRequests({ userId: input.userId }),
      ]);
      return {
        message: `I am ${name} ${company}, working in ${industry}. My Balea Sphere profile currently has: trust score ${trust}, signal score ${signal}, verification status "${verification}", access level "${access}". I have published ${listings.length} marketplace listing(s), have ${threads.length} active conversation(s), and have used AI tools ${aiHistory.length} time(s).\n\nWhat specific improvements should I make to my profile to increase my visibility, trust score, and attract higher-quality connections? Give me 3–5 concrete, actionable steps — no generic advice.`,
        context: "You are a profile optimisation expert for Balea Sphere, a private curated business network in Mallorca and the Balearic Islands.",
      };
    }

    case "deal_radar": {
      const listings = await listMarketplaceListings({ status: "active" });
      const listingsText = listings
        .slice(0, 20)
        .map(l => `• [${l.type}] ${l.title} — category: ${l.category}, min trust required: ${l.trustRequirement}, cost: ${l.creditsCost} cr`)
        .join("\n");
      return {
        message: `I am ${name} ${company}, working in ${industry} (trust score: ${trust}). My focus is: ${input.prompt}\n\nThese are the currently active listings on the Balea Sphere marketplace:\n${listingsText || "No active listings at this time."}\n\nBased on my focus and profile, which of these listings are most relevant for me? And what are 3 specific actions I should take now? Be concise and direct.`,
        context: "You are a deal sourcing expert for Balea Sphere, a private business network in the Balearic Islands.",
      };
    }

    case "marketplace_assistant": {
      return {
        message: `I am ${name} ${company}, working in ${industry} on Balea Sphere (trust score: ${trust}, access: ${access}). I want to create a marketplace listing for the following:\n\n${input.prompt}\n\nPlease write a compelling listing for me with these clearly labelled sections:\nTitle: (max 60 characters)\nSummary: (2 sentences)\nDescription: (3–4 sentences, persuasive)\nSuggested listing type: (choose from: opportunity, request, offer, collaboration, private_deal)\n\nMake it specific and attractive for a private business network in Mallorca.`,
        context: "You are an expert at writing compelling marketplace listings for Balea Sphere, a private curated business network in Mallorca and the Balearic Islands.",
      };
    }

    case "summary": {
      const [balance, threads, aiHistory, listings] = await Promise.all([
        sumCreditBalance(input.userId),
        listChatThreadsByUser(input.userId),
        listAiRequests({ userId: input.userId }),
        listMarketplaceListings({ postedBy: input.userId }),
      ]);
      return {
        message: `I am ${name} ${company}, working in ${industry}. Here is my current Balea Sphere status: trust score ${trust}, signal score ${signal}, verification "${verification}", access level "${access}", credit balance ${balance} cr, ${threads.length} active conversation(s), ${listings.length} marketplace listing(s), ${aiHistory.length} AI tool use(s).\n\nGive me a concise strategic overview of my network position, highlight my 2–3 key leverage points, and tell me the three most impactful actions I should take on the platform right now. Be specific and decisive.`,
        context: "You are a strategic network advisor for Balea Sphere, a private curated business network in Mallorca and the Balearic Islands.",
      };
    }

    case "reputation_signal": {
      const [listings, threads] = await Promise.all([
        listMarketplaceListings({ postedBy: input.userId }),
        listChatThreadsByUser(input.userId),
      ]);
      return {
        message: `I am ${name} ${company}, working in ${industry} on Balea Sphere. My current trust score is ${trust} and signal score is ${signal}. My verification status is "${verification}" and my access level is "${access}". I have ${listings.length} marketplace listing(s) and ${threads.length} active conversation(s).\n\nHow can I grow my trust score and signal score as efficiently as possible? Give me a prioritised list of the 3–4 highest-impact actions I can take, with specific platform actions (e.g. completing verification, publishing a listing, requesting intros, etc.).`,
        context: "You are an expert on trust and reputation systems in private professional networks, specifically Balea Sphere in the Balearic Islands.",
      };
    }

    case "concierge": {
      const [balance, listings] = await Promise.all([
        sumCreditBalance(input.userId),
        listMarketplaceListings({ status: "active" }),
      ]);
      const topListings = listings
        .slice(0, 6)
        .map(l => `• ${l.title} (${l.type})`)
        .join("\n");
      return {
        message: `I am ${name} ${company}, working in ${industry} on Balea Sphere. Trust score: ${trust}, signal: ${signal}, credit balance: ${balance} cr, access: ${access}.\n\nCurrently active marketplace opportunities:\n${topListings || "None at the moment."}\n\nMy goal: ${input.prompt}\n\nGiven my current position on the platform and this goal, what is the single most important strategic move I should make right now? Be decisive and specific.`,
        context: "You are the strategic concierge of Balea Sphere, an exclusive private network in Mallorca and the Balearic Islands.",
      };
    }

    default:
      return {
        message: input.prompt,
        context: "You are a strategic advisor for Balea Sphere, a curated private business network in Mallorca and the Balearic Islands. Answer with specific, actionable insight.",
      };
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

    // Build rich payload with real platform data per tool type
    const richPayload = await buildRichPayload({
      promptType: created.promptType,
      prompt: created.prompt,
      userId: session.userId,
    });

    const aiResult = await Promise.race([
      callOpenAI({
        message: richPayload.message,
        context: richPayload.context,
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 25000)),
    ]);

    let finalStatus: "completed" | "queued" = "queued";
    let responseSummary: string | undefined;
    if (aiResult?.answer) {
      const suggestions = aiResult.suggestions?.length ? `\n\n${aiResult.suggestions.join(" · ")}` : "";
      responseSummary = aiResult.answer + suggestions;
      await completeAiRequest({
        id: created.id,
        responseSummary,
        model: env.OPENAI_MODEL,
        completedAt: new Date().toISOString(),
      });
      finalStatus = "completed";
    }

    const balanceAfter = await sumCreditBalance(session.userId);

    await emitEventHub({
      event: "ai.request.created",
      data: {
        aiRequestId: created.id,
        userId: created.userId,
        userEmail: session.email,
        promptType: created.promptType,
        prompt: created.prompt,
        status: finalStatus,
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

    await incrementSignalScore(session.userId, 2);

    return reply.status(201).send({
      id: created.id,
      status: finalStatus,
      responseSummary,
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

    const fromWebhook = await Promise.race([
      callSupportWebhook({
        userId: session.userId,
        email: session.email,
        message: parsed.data.message,
        locale: parsed.data.locale,
        context: parsed.data.context,
        history: parsed.data.history
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 7000))
    ]);
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
