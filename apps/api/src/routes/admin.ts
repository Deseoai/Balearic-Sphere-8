import {
  AccessLevels,
  MemberRoles
} from "@mallorca/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import {
  emitEventHub,
  emitEmailAlert,
  emitHitlApplicationDecision,
  emitHitlUpgradeDecision
} from "../lib/n8nEvents.js";
import {
  createMagicLink,
  deleteUserById,
  getUserByEmail,
  getUserById,
  issueWelcomeCredits,
  listAccessRequests,
  listAuditEvents,
  listCircleUpgradeRequests,
  listMagicLinksByUserId,
  listUsers,
  recalculateTrustScore,
  reviewAccessRequest,
  reviewCircleUpgradeRequest,
  setUserEliteStatus,
  setUserRoleAndAccessByEmail,
  updateUserById,
  upsertUserAccount
} from "../store/index.js";
import { createOpaqueToken, hashToken } from "../lib/authSession.js";

const verificationStatuses = ["none", "pending", "verified", "rejected"] as const;
const adminSessionVersion = "v1";

const adminLoginSchema = z.object({
  password: z.string().min(1).max(320)
});

const userListQuerySchema = z.object({
  role: z.enum(MemberRoles).optional(),
  verificationStatus: z.enum(verificationStatuses).optional(),
  query: z.string().max(180).optional(),
  limit: z.coerce.number().min(1).max(1000).optional()
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  role: z.enum(MemberRoles).optional(),
  accessLevel: z.enum(AccessLevels).optional(),
  verificationStatus: z.enum(verificationStatuses).optional()
});

const updateUserSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    role: z.enum(MemberRoles).optional(),
    accessLevel: z.enum(AccessLevels).optional(),
    verificationStatus: z.enum(verificationStatuses).optional()
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "at_least_one_field_required"
  });

const deleteUserSchema = z.object({
  removedBy: z.string().min(2).max(120).optional()
});

const magicLinksQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(300).optional()
});

const issueMagicLinkSchema = z.object({
  redirectPath: z.string().min(1).max(240).optional()
});

function safeRedirectPath(value: string | undefined): string {
  const fallback = "/workspace";
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  return value.startsWith("//") ? fallback : value;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function secureTextEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signAdminSessionPayload(payload: string): string {
  return createHmac("sha256", env.ADMIN_API_TOKEN).update(payload).digest("base64url");
}

function issueAdminSessionToken(): {
  token: string;
  expiresAt: string;
} {
  const expiresMs = Date.now() + env.ADMIN_SESSION_TTL_HOURS * 3_600_000;
  const payload = `${adminSessionVersion}.${expiresMs}.${randomUUID().replaceAll("-", "")}`;
  const signature = signAdminSessionPayload(payload);
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresMs).toISOString()
  };
}

function verifyAdminSessionToken(token: string): boolean {
  const [version, expRaw, nonce, signature] = token.split(".");
  if (!version || !expRaw || !nonce || !signature) return false;
  if (version !== adminSessionVersion) return false;
  if (!/^\d+$/.test(expRaw)) return false;

  const payload = `${version}.${expRaw}.${nonce}`;
  const expected = signAdminSessionPayload(payload);
  if (!secureTextEquals(signature, expected)) return false;

  const expiresMs = Number(expRaw);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > Date.now();
}

function isAuthorizedAdminToken(token: string): boolean {
  if (secureTextEquals(token, env.ADMIN_API_TOKEN)) {
    return true;
  }
  return verifyAdminSessionToken(token);
}

function readToken(request: FastifyRequest): string | null {
  const sessionHeader = request.headers["x-admin-session"];
  if (typeof sessionHeader === "string" && sessionHeader.trim().length > 0) {
    return sessionHeader.trim();
  }

  const headerToken = request.headers["x-admin-token"];
  if (typeof headerToken === "string" && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }

  return null;
}

async function requireAdminToken(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply> {
  const token = readToken(request);
  if (!token || !isAuthorizedAdminToken(token)) {
    return reply.status(401).send({ error: "unauthorized_admin" });
  }
}

const applicationDecisionSchema = z.object({
  status: z.enum(["accepted", "rejected", "waitlisted", "on_hold", "onhold"]),
  humanScore: z.number().min(0).max(100).optional(),
  recommendedAccessLevel: z.enum(AccessLevels).optional(),
  adminNotes: z.string().max(1800).optional(),
  reviewedBy: z.string().min(2).max(120)
});

const upgradeDecisionSchema = z.object({
  status: z.enum(["approved", "rejected", "waitlisted", "on_hold", "onhold"]),
  decisionNotes: z.string().max(1800).optional(),
  reviewedBy: z.string().min(2).max(120)
});

function normalizeAccessRequestStatus(
  value: "accepted" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "accepted" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

function normalizeAccessRequestFilterStatus(
  value: "under_review" | "accepted" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "under_review" | "accepted" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

function normalizeUpgradeStatus(
  value: "approved" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "approved" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

function normalizeUpgradeFilterStatus(
  value: "under_review" | "approved" | "rejected" | "waitlisted" | "on_hold" | "onhold"
): "under_review" | "approved" | "rejected" | "waitlisted" {
  return value === "on_hold" || value === "onhold" ? "waitlisted" : value;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/admin/auth/login", async (request, reply) => {
    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const provided = parsed.data.password.trim();
    const expected = env.ADMIN_PANEL_PASSWORD.trim();
    if (!secureTextEquals(provided, expected)) {
      return reply.status(401).send({
        error: "invalid_admin_password"
      });
    }

    const session = issueAdminSessionToken();
    return reply.send({
      status: "authenticated",
      sessionToken: session.token,
      expiresAt: session.expiresAt
    });
  });

  app.get(
    "/v1/admin/auth/me",
    { preHandler: requireAdminToken },
    async () => ({
      status: "authenticated"
    })
  );

  app.get(
    "/v1/admin/access-requests",
    { preHandler: requireAdminToken },
    async (request) => {
      const query = request.query as {
        status?: "under_review" | "accepted" | "rejected" | "waitlisted" | "on_hold" | "onhold";
      };
      const status = query.status ? normalizeAccessRequestFilterStatus(query.status) : undefined;
      return {
        items: await listAccessRequests(status ? { status } : undefined)
      };
    }
  );

  app.post(
    "/v1/admin/access-requests/:id/decision",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = applicationDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const reviewedAt = new Date().toISOString();
      const normalizedStatus = normalizeAccessRequestStatus(parsed.data.status);
      const reviewed = await reviewAccessRequest({
        id,
        status: normalizedStatus,
        humanScore: parsed.data.humanScore,
        recommendedAccessLevel: parsed.data.recommendedAccessLevel,
        adminNotes: parsed.data.adminNotes,
        reviewedBy: parsed.data.reviewedBy,
        reviewedAt
      });

      if (!reviewed) {
        return reply.status(404).send({ error: "application_not_found" });
      }

      const eventId = randomUUID();
      const decisionData = {
        targetId: reviewed.id,
        applicationId: reviewed.id,
        status: reviewed.status,
        humanScore: reviewed.humanScore ?? 0,
        recommendedAccess: reviewed.recommendedAccessLevel,
        adminNotes: reviewed.adminNotes ?? "",
        reviewedBy: parsed.data.reviewedBy,
        reviewedAt
      };

      const hitlDispatch = await emitHitlApplicationDecision({
        source: "admin-ui",
        eventId,
        idempotencyKey: eventId,
        data: decisionData
      });

      if (reviewed.email) {
        const isAccepted = reviewed.status === "accepted";
        const isOnHold = reviewed.status === "waitlisted";
        await setUserRoleAndAccessByEmail({
          email: reviewed.email,
          role: isAccepted ? "member" : "applicant",
          accessLevel: isAccepted ? reviewed.recommendedAccessLevel : "explorer",
          verificationStatus: isAccepted ? "verified" : isOnHold ? "pending" : "rejected",
          website: isAccepted ? (reviewed.website ?? undefined) : undefined,
          annualRevenue: isAccepted ? (reviewed.annualRevenue ?? undefined) : undefined,
        });
        if (isAccepted) {
          const user = await getUserByEmail(reviewed.email);
          if (user) {
            await issueWelcomeCredits(user.userId);
            await recalculateTrustScore(user.userId);
          }
        }
      }

      await emitEventHub({
        event: "application.reviewed",
        source: "admin-ui",
        data: decisionData
      });

      await emitEmailAlert({
        source: "admin-ui",
        event: "email.application.reviewed",
        data: {
          notifyEmail: reviewed.email,
          adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          applicationId: reviewed.id,
          userEmail: reviewed.email,
          userName: reviewed.name,
          status: reviewed.status,
          reviewedBy: parsed.data.reviewedBy,
          reviewedAt,
          recommendedAccessLevel: reviewed.recommendedAccessLevel
        }
      });

      return reply.send({
        item: reviewed,
        hitlDispatch
      });
    }
  );

  app.get(
    "/v1/admin/circle-upgrades",
    { preHandler: requireAdminToken },
    async (request) => {
      const query = request.query as {
        status?: "under_review" | "approved" | "rejected" | "waitlisted" | "on_hold" | "onhold";
      };
      const status = query.status ? normalizeUpgradeFilterStatus(query.status) : undefined;
      return {
        items: await listCircleUpgradeRequests(status ? { status } : undefined)
      };
    }
  );

  app.post(
    "/v1/admin/circle-upgrades/:id/decision",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upgradeDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const reviewedAt = new Date().toISOString();
      const normalizedStatus = normalizeUpgradeStatus(parsed.data.status);
      const reviewed = await reviewCircleUpgradeRequest({
        id,
        status: normalizedStatus,
        reviewedBy: parsed.data.reviewedBy,
        reviewedAt,
        decisionNotes: parsed.data.decisionNotes
      });

      if (!reviewed) {
        return reply.status(404).send({ error: "upgrade_request_not_found" });
      }

      const eventId = randomUUID();
      const decisionData = {
        targetId: reviewed.id,
        requestId: reviewed.id,
        userId: reviewed.userId,
        circle: reviewed.circle,
        status: reviewed.status,
        currentAccess: reviewed.currentAccess,
        aiSuitability: reviewed.aiSuitability,
        reason: reviewed.decisionNotes ?? "",
        reviewedBy: parsed.data.reviewedBy,
        reviewedAt
      };

      const hitlDispatch = await emitHitlUpgradeDecision({
        source: "admin-ui",
        eventId,
        idempotencyKey: eventId,
        data: decisionData
      });

      await emitEventHub({
        event: "circle.access.reviewed",
        source: "admin-ui",
        data: decisionData
      });

      const account = reviewed.userId ? await getUserById(reviewed.userId) : undefined;
      if (reviewed.status === "approved" && account?.email) {
        await setUserRoleAndAccessByEmail({
          email: account.email,
          role: account.role === "applicant" ? "member" : account.role,
          accessLevel: "private_circle_eligible",
          verificationStatus: "verified"
        });
      }

      await emitEmailAlert({
        source: "admin-ui",
        event: "email.circle.access.reviewed",
        data: {
          notifyEmail: account?.email ?? "",
          adminEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          requestId: reviewed.id,
          userId: reviewed.userId,
          userEmail: account?.email ?? "",
          userName: account?.displayName ?? "",
          circle: reviewed.circle,
          status: reviewed.status,
          reviewedBy: parsed.data.reviewedBy,
          reviewedAt
        }
      });

      return reply.send({
        item: reviewed,
        hitlDispatch
      });
    }
  );

  app.get(
    "/v1/admin/users",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const parsed = userListQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_query",
          details: parsed.error.flatten()
        });
      }

      return {
        items: await listUsers(parsed.data)
      };
    }
  );

  app.post(
    "/v1/admin/users",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const role = parsed.data.role ?? "applicant";
      const verificationStatus =
        parsed.data.verificationStatus ??
        (role === "applicant" || role === "public_visitor" ? "none" : "verified");

      const item = await upsertUserAccount({
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        role,
        accessLevel: parsed.data.accessLevel ?? "explorer",
        verificationStatus
      });

      await emitEventHub({
        event: "user.account.synced",
        source: "admin-ui",
        data: {
          userId: item.userId,
          email: item.email,
          displayName: item.displayName ?? "",
          role: item.role,
          accessLevel: item.accessLevel,
          verificationStatus: item.verificationStatus,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }
      });

      return reply.status(201).send({ item });
    }
  );

  app.patch(
    "/v1/admin/users/:id",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const item = await updateUserById({
        userId: id,
        displayName: parsed.data.displayName,
        role: parsed.data.role,
        accessLevel: parsed.data.accessLevel,
        verificationStatus: parsed.data.verificationStatus
      });

      if (!item) {
        return reply.status(404).send({ error: "user_not_found" });
      }

      await emitEventHub({
        event: "user.account.synced",
        source: "admin-ui",
        data: {
          userId: item.userId,
          email: item.email,
          displayName: item.displayName ?? "",
          role: item.role,
          accessLevel: item.accessLevel,
          verificationStatus: item.verificationStatus,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }
      });

      return reply.send({ item });
    }
  );

  app.delete(
    "/v1/admin/users/:id",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = deleteUserSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const removedBy = parsed.data.removedBy?.trim() || "admin-console";
      const item = await deleteUserById({
        userId: id,
        removedBy
      });

      if (!item) {
        return reply.status(404).send({ error: "user_not_found" });
      }

      return reply.send({ item });
    }
  );

  app.get(
    "/v1/admin/users/:id/magic-links",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = magicLinksQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_query",
          details: parsed.error.flatten()
        });
      }

      return {
        items: await listMagicLinksByUserId({
          userId: id,
          limit: parsed.data.limit
        })
      };
    }
  );

  app.post(
    "/v1/admin/users/:id/magic-links/issue",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = issueMagicLinkSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsed.error.flatten()
        });
      }

      const user = await getUserById(id);
      if (!user) {
        return reply.status(404).send({ error: "user_not_found" });
      }

      const now = new Date().toISOString();
      const expiresAt = addMinutes(now, env.MAGIC_LINK_TTL_MINUTES);
      const redirectPath = safeRedirectPath(parsed.data.redirectPath);
      const rawMagicToken = createOpaqueToken();
      const magicLinkUrl = `${env.APP_BASE_URL}${redirectPath}${redirectPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(rawMagicToken)}`;

      await createMagicLink({
        userId: user.userId,
        email: user.email,
        tokenHash: hashToken(rawMagicToken),
        expiresAt,
        createdAt: now
      });

      await emitEventHub({
        source: "admin-ui",
        event: "audit.magic_link.issued",
        data: {
          auditId: `magic-link-admin-${user.userId}-${Date.now()}`,
          actorUserId: "admin-ui",
          action: "auth.magic_link.issued",
          targetType: "user",
          targetId: user.userId,
          metadata: {
            email: user.email,
            expiresAt,
            redirectPath,
            magicLinkUrl
          },
          createdAt: now
        }
      });

      await emitEmailAlert({
        source: "admin-ui",
        event: "email.auth.magic_link.requested",
        data: {
          userId: user.userId,
          userEmail: user.email,
          notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
          role: user.role,
          accessLevel: user.accessLevel,
          requestedAt: now,
          expiresAt,
          magicLinkUrl
        }
      });

      return reply.status(201).send({
        status: "magic_link_issued",
        item: {
          userId: user.userId,
          email: user.email,
          createdAt: now,
          expiresAt,
          status: "active",
          magicLinkLabel: `Sign-in link for ${user.displayName || user.email}`
        },
        magicLinkUrl
      });
    }
  );

  app.get(
    "/v1/admin/audit",
    { preHandler: requireAdminToken },
    async (request) => {
      const query = request.query as { limit?: number };
      return {
        items: await listAuditEvents(query.limit ?? 200)
      };
    }
  );

  // Elite Circle — toggle membership for a user
  app.patch(
    "/v1/admin/users/:id/elite",
    { preHandler: requireAdminToken },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = z.object({ isElite: z.boolean() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload" });
      }
      const user = await getUserById(id);
      if (!user) return reply.status(404).send({ error: "user_not_found" });
      await setUserEliteStatus(id, parsed.data.isElite);
      await emitEventHub({
        event: parsed.data.isElite ? "user.elite.granted" : "user.elite.revoked",
        source: "admin-ui",
        data: {
          userId: id,
          email: user.email,
          displayName: user.displayName ?? "",
          isElite: parsed.data.isElite,
          changedAt: new Date().toISOString()
        }
      });
      return reply.send({ userId: id, isElite: parsed.data.isElite });
    }
  );
}
