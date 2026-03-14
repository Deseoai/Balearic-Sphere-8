import { AnnualRevenueRanges, ApplicantCategories, IndustrySectors, type AccessRequestPayload } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub, emitRewardEvent } from "../lib/n8nEvents.js";
import { scoreApplicant } from "../lib/scoring.js";
import { getUserByEmail, listAccessRequests, saveAccessRequest, setUserVipStatus, upsertUserAccount } from "../store/index.js";

const VIP_REVENUE_THRESHOLD: AnnualRevenueRange[] = ["1m_to_5m", "over_5m"];
type AnnualRevenueRange = (typeof AnnualRevenueRanges)[number];

const accessRequestSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  location: z.string().min(2).max(120),
  category: z.enum(ApplicantCategories),
  industry: z.enum(IndustrySectors).optional(),
  companyName: z.string().min(1).max(120).optional().or(z.literal("")),
  annualRevenue: z.enum(AnnualRevenueRanges).optional(),
  referralCode: z.string().min(4).max(80).optional().or(z.literal("")),
  whatOffer: z.string().min(15).max(1500),
  whatSeek: z.string().min(15).max(1500),
  whyJoin: z.string().min(15).max(1500),
  website: z.string().url(),
  linkedin: z.string().url().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  consentGiven: z.literal(true, { errorMap: () => ({ message: "You must agree to the data processing terms to submit." }) })
});

export async function registerAccessRequestRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/access-requests", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== "admin" && session.role !== "super_admin") {
      return reply.status(403).send({ error: "forbidden_access_requests_scope" });
    }

    const { status } = request.query as {
      status?: "under_review" | "accepted" | "rejected" | "waitlisted" | "on_hold" | "onhold";
    };
    const normalizedStatus = status === "on_hold" || status === "onhold" ? "waitlisted" : status;
    return {
      items: await listAccessRequests(normalizedStatus ? { status: normalizedStatus } : undefined)
    };
  });

  app.post("/v1/access-requests", async (request, reply) => {
    const parsed = accessRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const cleanPayload: AccessRequestPayload = {
      ...parsed.data,
      companyName: parsed.data.companyName || undefined,
      annualRevenue: parsed.data.annualRevenue || undefined,
      referralCode: parsed.data.referralCode || undefined,
      industry: parsed.data.industry || undefined,
      linkedin: parsed.data.linkedin || undefined,
      instagram: parsed.data.instagram || undefined
    };

    const isVipRevenue = cleanPayload.annualRevenue != null && VIP_REVENUE_THRESHOLD.includes(cleanPayload.annualRevenue as AnnualRevenueRange);
    const scoring = scoreApplicant(cleanPayload);
    const createdAt = new Date().toISOString();
    const applicantId = randomUUID();
    const account = await upsertUserAccount({
      email: cleanPayload.email,
      displayName: cleanPayload.name,
      companyName: cleanPayload.companyName
    });

    const created = await saveAccessRequest({
      id: applicantId,
      createdAt,
      status: "under_review",
      aiPreScore: scoring.aiPreScore,
      recommendedAccessLevel: scoring.recommendedAccessLevel,
      ...cleanPayload
    });

    // Auto-VIP: Revenue >= 1M EUR triggers VIP status on approval
    if (isVipRevenue) {
      await setUserVipStatus(account.userId, true);
    }

    // Reward referrer if a valid referral code was provided
    if (cleanPayload.referralCode) {
      const referrer = await getUserByEmail(cleanPayload.referralCode).catch(() => undefined);
      if (referrer) {
        const referralData = {
          referrerId: referrer.userId,
          referrerEmail: referrer.email,
          applicantEmail: cleanPayload.email,
          applicationId: created.id
        };
        await emitEventHub({ event: "credits.referral.pending", data: referralData });
        await emitRewardEvent({ event: "credits.referral.pending", data: referralData });
      }
    }

    // Log consent to n8n → Notion for GDPR compliance
    await emitEventHub({
      event: "user.consent.given",
      data: {
        userId: account.userId,
        email: created.email,
        name: created.name,
        consentType: "data_processing_membership",
        consentText: "I agree that Balea Sphere stores and processes my personal data for the purpose of membership administration and network facilitation, in accordance with the Privacy Policy.",
        consentGiven: true,
        givenAt: createdAt,
        applicationId: created.id,
        ipContext: "access_request_form"
      }
    });

    const applicationEvent = await emitEventHub({
      event: "application.submitted",
      data: {
        applicationId: created.id,
        userId: account.userId,
        name: created.name,
        email: created.email,
        category: created.category,
        location: created.location,
        companyName: created.companyName ?? "",
        annualRevenue: created.annualRevenue ?? "",
        isVipRevenue,
        whatOffer: created.whatOffer,
        whatSeek: created.whatSeek,
        whyJoin: created.whyJoin,
        status: created.status,
        submittedAt: created.createdAt
      }
    });

    await emitEventHub({
      event: "application.scored",
      data: {
        applicationId: created.id,
        aiScore: created.aiPreScore,
        recommendedAccess: created.recommendedAccessLevel
      }
    });

    await emitEventHub({
      event: "user.account.synced",
      data: {
        userId: account.userId,
        email: account.email,
        displayName: account.displayName ?? "",
        role: account.role,
        accessLevel: account.accessLevel,
        verificationStatus: account.verificationStatus
      }
    });


    await emitEmailAlert({
      event: "email.application.submitted",
      data: {
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        userId: account.userId,
        userEmail: created.email,
        applicantName: created.name,
        category: created.category,
        location: created.location,
        aiScore: created.aiPreScore,
        recommendedAccessLevel: created.recommendedAccessLevel,
        applicationId: created.id,
        submittedAt: created.createdAt
      }
    });

    return reply.status(201).send({
      id: created.id,
      userId: account.userId,
      status: created.status,
      aiPreScore: created.aiPreScore,
      recommendedAccessLevel: created.recommendedAccessLevel,
      message: "Application received. We will get back to you after review.",
      eventDispatch: applicationEvent
    });
  });
}
