import type { FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { env } from "../config.js";
import { createOpaqueToken, hashToken, readBearerToken, requireSession } from "../lib/authSession.js";
import { emitEmailAlert, emitEventHub } from "../lib/n8nEvents.js";
import {
  consumeMagicLink,
  createMagicLink,
  createSession,
  deleteUserById,
  recalculateTrustScore,
  revokeSessionByToken,
  updateUserById,
  upsertUserAccount
} from "../store/index.js";

const requestMagicLinkSchema = z.object({
  email: z.string().email(),
  displayName: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(120).optional()
  ),
  redirectPath: z.string().min(1).max(240).optional()
});

const verifyMagicLinkSchema = z.object({
  token: z.string().min(20).max(300)
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

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/request-magic-link", async (request, reply) => {
    const parsed = requestMagicLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const now = new Date().toISOString();
    const redirectPath = safeRedirectPath(parsed.data.redirectPath);
    const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined;
    const account = await upsertUserAccount({
      email: parsed.data.email,
      displayName: parsed.data.displayName
    });

    const rawMagicToken = createOpaqueToken();
    const magicTokenHash = hashToken(rawMagicToken);
    const expiresAt = addMinutes(now, env.MAGIC_LINK_TTL_MINUTES);

    await createMagicLink({
      userId: account.userId,
      email: account.email,
      tokenHash: magicTokenHash,
      expiresAt,
      createdAt: now,
      requestedIp: request.ip,
      requestedUserAgent: userAgent
    });

    const separator = redirectPath.includes("?") ? "&" : "?";
    const magicLinkUrl = `${env.APP_BASE_URL}${redirectPath}${separator}token=${encodeURIComponent(rawMagicToken)}`;

    await emitEventHub({
      source: "auth-api",
      event: "auth.magic_link.requested",
      data: {
        userId: account.userId,
        email: account.email,
        displayName: account.displayName ?? "",
        role: account.role,
        accessLevel: account.accessLevel,
        requestedAt: now,
        expiresAt,
        redirectPath
      }
    });

    await emitEventHub({
      source: "auth-api",
      event: "audit.magic_link.issued",
      data: {
        auditId: `magic-link-${account.userId}-${Date.now()}`,
        actorUserId: account.userId,
        action: "auth.magic_link.issued",
        targetType: "user",
        targetId: account.userId,
        metadata: {
          email: account.email,
          expiresAt,
          redirectPath,
          magicLinkUrl
        },
        createdAt: now
      }
    });

    await emitEmailAlert({
      source: "auth-api",
      event: "email.auth.magic_link.requested",
      data: {
        userId: account.userId,
        userEmail: account.email,
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        role: account.role,
        accessLevel: account.accessLevel,
        requestedAt: now,
        expiresAt,
        magicLinkUrl
      }
    });

    const response: {
      status: "magic_link_sent";
      message: string;
      expiresAt: string;
      magicLinkPreview?: string;
    } = {
      status: "magic_link_sent",
      message: "Your sign-in link is ready. Please check your inbox.",
      expiresAt
    };

    // Prevent token disclosure in production responses.
    if (env.NODE_ENV !== "production") {
      response.magicLinkPreview = magicLinkUrl;
    }

    return reply.status(202).send(response);
  });

  app.post("/v1/auth/verify-magic-link", async (request, reply) => {
    const parsed = verifyMagicLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    const consumedAt = new Date().toISOString();
    const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined;
    const account = await consumeMagicLink(hashToken(parsed.data.token), consumedAt);
    if (!account) {
      return reply.status(400).send({ error: "invalid_or_expired_magic_link" });
    }

    const sessionToken = createOpaqueToken();
    const sessionExpiresAt = addDays(consumedAt, env.SESSION_TTL_DAYS);
    await createSession({
      userId: account.userId,
      tokenHash: hashToken(sessionToken),
      createdAt: consumedAt,
      expiresAt: sessionExpiresAt,
      ip: request.ip,
      userAgent
    });

    await emitEventHub({
      source: "auth-api",
      event: "auth.login.success",
      data: {
        userId: account.userId,
        email: account.email,
        role: account.role,
        accessLevel: account.accessLevel,
        loggedInAt: consumedAt,
        sessionExpiresAt
      }
    });

    await emitEmailAlert({
      source: "auth-api",
      event: "email.auth.login.success",
      data: {
        userId: account.userId,
        userEmail: account.email,
        notifyEmail: env.ADMIN_NOTIFY_EMAIL ?? "",
        role: account.role,
        accessLevel: account.accessLevel,
        loggedInAt: consumedAt,
        sessionExpiresAt
      }
    });

    return reply.send({
      status: "authenticated",
      sessionToken,
      expiresAt: sessionExpiresAt,
      user: {
        userId: account.userId,
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        accessLevel: account.accessLevel,
        verificationStatus: account.verificationStatus
      }
    });
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    return reply.send({
      user: session
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const token = readBearerToken(request);
    if (token) {
      await revokeSessionByToken(token, new Date().toISOString());
    }

    await emitEventHub({
      source: "auth-api",
      event: "auth.logout",
      data: {
        userId: session.userId,
        email: session.email,
        loggedOutAt: new Date().toISOString()
      }
    });

    return reply.send({ status: "logged_out" });
  });

  // Update own profile
  const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(120).optional(),
    companyName: z.string().max(120).optional().or(z.literal("")),
    industry: z.string().max(80).optional().or(z.literal("")),
  });

  app.patch("/v1/auth/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const updated = await updateUserById({
      userId: session.userId,
      displayName: parsed.data.displayName,
      companyName: parsed.data.companyName,
      industry: parsed.data.industry,
    });

    if (!updated) return reply.status(404).send({ error: "user_not_found" });

    await recalculateTrustScore(session.userId);

    return reply.send({ user: updated });
  });

  // Upload avatar (base64)
  const avatarUploadSchema = z.object({
    imageBase64: z.string().min(10).max(4_000_000), // base64 data (~3MB original)
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  });

  app.post("/v1/auth/avatar", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = avatarUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "file_too_large", message: "Image is too large. Please use a photo under 2MB." });
    }

    const ext = parsed.data.mimeType === "image/png" ? "png" : parsed.data.mimeType === "image/webp" ? "webp" : "jpg";
    const avatarDir = "/opt/balea-sphere/current/apps/web/public/avatars";
    try { mkdirSync(avatarDir, { recursive: true }); } catch { /* exists */ }

    // Use a versioned filename to avoid browser caching stale/missing images
    const version = Date.now();
    const filename = `${session.userId}_${version}.${ext}`;
    const filepath = join(avatarDir, filename);

    // Delete old avatar file(s) for this user
    const fs = await import("node:fs/promises");
    try {
      const { readdirSync } = await import("node:fs");
      const existing = readdirSync(avatarDir).filter(f => f.startsWith(`${session.userId}_`) || f === `${session.userId}.jpg` || f === `${session.userId}.png` || f === `${session.userId}.webp`);
      await Promise.all(existing.map(f => fs.unlink(join(avatarDir, f)).catch(() => {})));
    } catch { /* ignore */ }

    // Strip data URL prefix if present
    const base64Data = parsed.data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 3_000_000) {
      return reply.status(400).send({ error: "file_too_large", message: "Avatar must be under 3MB" });
    }

    await fs.writeFile(filepath, buffer);

    const avatarUrl = `/avatars/${filename}`;
    const updated = await updateUserById({ userId: session.userId, avatarUrl });
    if (!updated) return reply.status(404).send({ error: "user_not_found" });

    await recalculateTrustScore(session.userId);

    return reply.send({ avatarUrl, user: updated });
  });

  // DELETE /v1/auth/me — permanent account deletion (GDPR right to erasure)
  app.delete("/v1/auth/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const parsed = z.object({ confirmEmail: z.string().email() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", message: "Provide your email address to confirm deletion." });
    }
    if (parsed.data.confirmEmail.toLowerCase() !== session.email.toLowerCase()) {
      return reply.status(400).send({ error: "email_mismatch", message: "Confirmation email does not match your account email." });
    }

    const deletedAt = new Date().toISOString();

    // Emit deletion event to n8n → Notion BEFORE deleting (so we have the data)
    await emitEventHub({
      event: "user.account.deleted",
      data: {
        userId: session.userId,
        email: session.email,
        requestedAt: deletedAt,
        reason: "user_self_deletion",
        gdprBasis: "right_to_erasure_article_17_gdpr",
        note: "All personal data removed from the application database. This record is the only retention for audit compliance."
      }
    });

    await deleteUserById({ userId: session.userId, removedBy: session.userId });

    return reply.send({ status: "account_deleted", message: "Your account and all associated data have been permanently removed." });
  });
}
