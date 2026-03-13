import crypto from "node:crypto";
import type { SessionUserRecord } from "@mallorca/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getSessionByToken } from "../store/index.js";

export type SessionUser = SessionUserRecord;

export function createOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function readBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.length > 10) return token;
  }

  const alt = request.headers["x-session-token"];
  if (typeof alt === "string" && alt.trim().length > 10) {
    return alt.trim();
  }

  return null;
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SessionUser | null> {
  const token = readBearerToken(request);
  if (!token) {
    void reply.status(401).send({ error: "missing_session_token" });
    return null;
  }

  const session = await getSessionByToken(token);
  if (!session) {
    void reply.status(401).send({ error: "invalid_or_expired_session" });
    return null;
  }

  return session;
}

export function requireOwnershipOrAdmin(
  session: SessionUser,
  targetUserId: string,
  reply: FastifyReply
): boolean {
  if (session.role === "admin" || session.role === "super_admin" || session.userId === targetUserId) {
    return true;
  }
  void reply.status(403).send({ error: "forbidden_user_scope" });
  return false;
}

export function hasMemberWorkspaceAccess(session: SessionUser): boolean {
  if (session.role === "admin" || session.role === "super_admin" || session.role === "moderator") {
    return true;
  }

  if (session.verificationStatus === "pending" || session.verificationStatus === "rejected") {
    return false;
  }

  return (
    session.role === "member" ||
    session.role === "verified_member" ||
    session.role === "premium_member" ||
    session.role === "circle_member"
  );
}

export function requireMemberWorkspaceAccess(session: SessionUser, reply: FastifyReply): boolean {
  if (hasMemberWorkspaceAccess(session)) {
    return true;
  }

  void reply.status(403).send({
    error: "member_access_required",
    message: "This action unlocks after your application is approved.",
    role: session.role,
    accessLevel: session.accessLevel,
    verificationStatus: session.verificationStatus
  });
  return false;
}
