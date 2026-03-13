import { MarketplaceListingTypes, type MarketplaceListingRecord } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import {
  hasMemberWorkspaceAccess,
  requireMemberWorkspaceAccess,
  requireSession,
  type SessionUser
} from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub, emitRewardEvent } from "../lib/n8nEvents.js";
import {
  addCreditTransaction,
  incrementSignalScore,
  issueActivityCredits,
  listMarketplaceListings,
  saveMarketplaceListing,
  sumCreditBalance
} from "../store/index.js";

const createListingSchema = z.object({
  title: z.string().min(4).max(180),
  type: z.enum(MarketplaceListingTypes),
  category: z.string().min(2).max(120),
  summary: z.string().min(10).max(600),
  description: z.string().min(20).max(4000),
  visibility: z.enum(["members", "circle", "private"]).default("members"),
  creditsCost: z.number().min(0).max(10000).default(0),
  trustRequirement: z.number().min(0).max(100).default(0)
});

const LISTING_PUBLISH_FEE = 10;

function canViewListing(
  session: SessionUser,
  listing: MarketplaceListingRecord
): boolean {
  if (listing.postedBy === session.userId) return true;
  if (session.role === "admin" || session.role === "super_admin") return true;

  const hasMemberAccess = hasMemberWorkspaceAccess(session);

  const hasCircleAccess =
    session.accessLevel === "private_circle_eligible" ||
    session.role === "circle_member" ||
    session.role === "premium_member" ||
    session.role === "moderator";

  if (listing.visibility === "members") return hasMemberAccess;
  if (listing.visibility === "circle") return hasCircleAccess;
  return false;
}

export async function registerMarketplaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/marketplace/listings", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = request.query as { status?: "active" | "paused" | "closed"; mine?: "true" | "false" };
    const rows = await listMarketplaceListings({
      postedBy: query.mine === "false" ? undefined : session.userId,
      status: query.status
    });

    return {
      items: rows.filter((listing) => canViewListing(session, listing))
    };
  });

  app.post("/v1/marketplace/listings", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;

    const parsed = createListingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const balanceBefore = await sumCreditBalance(session.userId);
    if (balanceBefore < LISTING_PUBLISH_FEE) {
      return reply.status(402).send({
        error: "insufficient_credits",
        required: LISTING_PUBLISH_FEE,
        balance: balanceBefore
      });
    }

    const created = await saveMarketplaceListing({
      id: randomUUID(),
      postedBy: session.userId,
      title: parsed.data.title,
      type: parsed.data.type,
      category: parsed.data.category,
      summary: parsed.data.summary,
      description: parsed.data.description,
      visibility: parsed.data.visibility,
      status: "active",
      creditsCost: parsed.data.creditsCost,
      trustRequirement: parsed.data.trustRequirement,
      createdAt: new Date().toISOString()
    });
    const debit = await addCreditTransaction({
      id: randomUUID(),
      userId: session.userId,
      type: "spend_unlock",
      amount: -LISTING_PUBLISH_FEE,
      reason: "Marketplace listing publish fee",
      createdAt: created.createdAt
    });

    const dispatch = await emitEventHub({
      event: "marketplace.listing.created",
      data: {
        listingId: created.id,
        postedBy: created.postedBy,
        userEmail: session.email,
        title: created.title,
        type: created.type,
        category: created.category,
        summary: created.summary,
        description: created.description,
        visibility: created.visibility,
        status: created.status,
        creditsCost: created.creditsCost,
        trustRequirement: created.trustRequirement,
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
      event: "email.marketplace.listing.created",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        listingId: created.id,
        userId: session.userId,
        userEmail: session.email,
        title: created.title,
        type: created.type,
        category: created.category,
        status: created.status,
        chargedCredits: LISTING_PUBLISH_FEE,
        createdAt: created.createdAt
      }
    });

    // First-listing bonus: 15cr, idempotent via contribution_reward type
    const bonus = await issueActivityCredits({
      userId: session.userId,
      type: "contribution_reward",
      amount: 15,
      reason: "First marketplace listing published"
    });
    if (bonus.amount > 0) {
      const bonusData = {
        transactionId: bonus.id,
        userId: bonus.userId,
        amount: bonus.amount,
        type: bonus.type,
        reason: bonus.reason,
        createdAt: bonus.createdAt
      };
      await emitEventHub({ event: "credits.reward.issued", data: bonusData });
      await emitRewardEvent({ event: "credits.reward.issued", data: bonusData });
    }

    await incrementSignalScore(session.userId, 4);

    const balanceAfter = await sumCreditBalance(session.userId);

    return reply.status(201).send({
      id: created.id,
      status: created.status,
      dispatch,
      chargedCredits: LISTING_PUBLISH_FEE,
      balance: balanceAfter
    });
  });
}
