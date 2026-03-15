import type {
  AccessLevel,
  AccessRequestRecord,
  AccessRequestStatus,
  AiRequestRecord,
  ChatMessageRecord,
  ChatThreadRecord,
  CircleUpgradeRequestRecord,
  CircleUpgradeStatus,
  CreditTransaction,
  CreditTransactionType,
  MarketplaceListingRecord,
  NetworkGraphEdge,
  NetworkGraphNode,
  SessionUserRecord,
  UserAccountRecord
} from "@mallorca/shared";
import { createHash, randomUUID } from "node:crypto";

const accessRequests: AccessRequestRecord[] = [];
const credits: CreditTransaction[] = [];
const upgrades: CircleUpgradeRequestRecord[] = [];
const aiRequests: AiRequestRecord[] = [];
const listings: MarketplaceListingRecord[] = [];
const chatThreads: ChatThreadRecord[] = [];
const chatMessages: ChatMessageRecord[] = [];
const users: UserAccountRecord[] = [];

type MagicLinkRecord = {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
  requestedIp?: string;
  requestedUserAgent?: string;
};

type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastSeenAt: string;
  ip?: string;
  userAgent?: string;
};

const magicLinks: MagicLinkRecord[] = [];
const sessions: SessionRecord[] = [];

const processedWebhookKeys = new Set<string>();
const processedEventIds = new Set<string>();

type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const auditEvents: AuditEvent[] = [];

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "member";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 80);
}

function nowIso(): string {
  return new Date().toISOString();
}

function pruneArray<T>(rows: T[], predicate: (row: T) => boolean): void {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (predicate(rows[i])) {
      rows.splice(i, 1);
    }
  }
}

function normalizePair(userA: string, userB: string): { participantA: string; participantB: string } {
  return userA < userB
    ? { participantA: userA, participantB: userB }
    : { participantA: userB, participantB: userA };
}

export function saveAccessRequest(record: AccessRequestRecord): AccessRequestRecord {
  accessRequests.push(record);
  addAuditEvent({
    action: "application.created",
    targetType: "application",
    targetId: record.id,
    actor: "system",
    metadata: { status: record.status, aiPreScore: record.aiPreScore }
  });
  return record;
}

export function listAccessRequests(filter?: {
  status?: AccessRequestStatus;
}): AccessRequestRecord[] {
  const rows = filter?.status
    ? accessRequests.filter((row) => row.status === filter.status)
    : accessRequests;
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAccessRequestById(id: string): AccessRequestRecord | undefined {
  return accessRequests.find((row) => row.id === id);
}

export function reviewAccessRequest(input: {
  id: string;
  status: AccessRequestStatus;
  humanScore?: number;
  recommendedAccessLevel?: AccessLevel;
  adminNotes?: string;
  reviewedBy: string;
  reviewedAt: string;
}): AccessRequestRecord | null {
  const row = getAccessRequestById(input.id);
  if (!row) return null;

  row.status = input.status;
  row.humanScore = input.humanScore;
  row.reviewedAt = input.reviewedAt;
  row.reviewedBy = input.reviewedBy;
  row.adminNotes = input.adminNotes;
  if (input.recommendedAccessLevel) {
    row.recommendedAccessLevel = input.recommendedAccessLevel;
  }

  addAuditEvent({
    action: "application.reviewed",
    targetType: "application",
    targetId: row.id,
    actor: input.reviewedBy,
    metadata: {
      status: row.status,
      humanScore: row.humanScore ?? null,
      recommendedAccessLevel: row.recommendedAccessLevel
    }
  });

  return row;
}

export function applyReviewedApplicationCallback(input: {
  applicationId: string;
  status: AccessRequestStatus;
  humanScore?: number;
  recommendedAccessLevel?: AccessLevel;
  adminNotes?: string;
  reviewedAt: string;
  reviewedBy: string;
}): AccessRequestRecord {
  const existing = getAccessRequestById(input.applicationId);
  if (!existing) {
    const placeholder: AccessRequestRecord = {
      id: input.applicationId,
      name: "Imported applicant",
      email: "",
      location: "unknown",
      category: "other",
      whatOffer: "",
      whatSeek: "",
      whyJoin: "",
      createdAt: input.reviewedAt,
      status: "under_review",
      aiPreScore: 0,
      recommendedAccessLevel: "explorer"
    };
    saveAccessRequest(placeholder);
  }

  return (
    reviewAccessRequest({
      id: input.applicationId,
      status: input.status,
      humanScore: input.humanScore,
      recommendedAccessLevel: input.recommendedAccessLevel,
      adminNotes: input.adminNotes,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt
    }) ?? getAccessRequestById(input.applicationId)!
  );
}

export function addCreditTransaction(tx: CreditTransaction): CreditTransaction {
  credits.push(tx);
  addAuditEvent({
    action: "credits.transaction.created",
    targetType: "credit_transaction",
    targetId: tx.id,
    actor: "system",
    metadata: {
      userId: tx.userId,
      amount: tx.amount,
      type: tx.type
    }
  });
  return tx;
}

export function listCreditTransactions(userId: string): CreditTransaction[] {
  return credits
    .filter((tx) => tx.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function sumCreditBalance(userId: string): number {
  return listCreditTransactions(userId).reduce((acc, tx) => acc + tx.amount, 0);
}

export function issueWelcomeCredits(userId: string): CreditTransaction[] {
  const now = new Date().toISOString();
  const entries: Array<{ amount: number; type: CreditTransactionType; reason: string }> = [
    { amount: 100, type: "welcome_bonus", reason: "Initial access credits" },
    { amount: 25, type: "profile_completion", reason: "Profile completed" }
  ];
  const existingTypes = new Set(listCreditTransactions(userId).map((tx) => tx.type));

  return entries
    .filter((entry) => !existingTypes.has(entry.type))
    .map((entry) =>
      addCreditTransaction({
        id: randomUUID(),
        userId,
        amount: entry.amount,
        type: entry.type,
        reason: entry.reason,
        createdAt: now
      })
    );
}

export function saveCircleUpgradeRequest(record: CircleUpgradeRequestRecord): CircleUpgradeRequestRecord {
  upgrades.push(record);
  addAuditEvent({
    action: "circle.access.requested",
    targetType: "circle_upgrade",
    targetId: record.id,
    actor: record.userId,
    metadata: { circle: record.circle, aiSuitability: record.aiSuitability }
  });
  return record;
}

export function listCircleUpgradeRequests(filter?: {
  userId?: string;
  status?: CircleUpgradeStatus;
}): CircleUpgradeRequestRecord[] {
  return upgrades
    .filter((row) => (filter?.userId ? row.userId === filter.userId : true))
    .filter((row) => (filter?.status ? row.status === filter.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCircleUpgradeRequestById(id: string): CircleUpgradeRequestRecord | undefined {
  return upgrades.find((row) => row.id === id);
}

export function reviewCircleUpgradeRequest(input: {
  id: string;
  status: CircleUpgradeStatus;
  reviewedBy: string;
  reviewedAt: string;
  decisionNotes?: string;
}): CircleUpgradeRequestRecord | null {
  const row = getCircleUpgradeRequestById(input.id);
  if (!row) return null;

  row.status = input.status;
  row.reviewedBy = input.reviewedBy;
  row.reviewedAt = input.reviewedAt;
  row.decisionNotes = input.decisionNotes;

  addAuditEvent({
    action: "circle.access.reviewed",
    targetType: "circle_upgrade",
    targetId: row.id,
    actor: input.reviewedBy,
    metadata: { status: row.status, circle: row.circle }
  });

  return row;
}

export function applyReviewedUpgradeCallback(input: {
  requestId: string;
  status: CircleUpgradeStatus;
  reviewedAt: string;
  reviewedBy: string;
  reason?: string;
}): CircleUpgradeRequestRecord {
  const existing = getCircleUpgradeRequestById(input.requestId);
  if (!existing) {
    saveCircleUpgradeRequest({
      id: input.requestId,
      userId: "unknown",
      circle: "unknown",
      currentAccess: "explorer",
      status: "under_review",
      aiSuitability: 0,
      reason: "",
      createdAt: input.reviewedAt
    });
  }

  return (
    reviewCircleUpgradeRequest({
      id: input.requestId,
      status: input.status,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      decisionNotes: input.reason
    }) ?? getCircleUpgradeRequestById(input.requestId)!
  );
}

export function saveAiRequest(record: AiRequestRecord): AiRequestRecord {
  aiRequests.push(record);
  addAuditEvent({
    action: "ai.request.created",
    targetType: "ai_request",
    targetId: record.id,
    actor: record.userId,
    metadata: { promptType: record.promptType, status: record.status }
  });
  return record;
}

export function listAiRequests(filter?: { userId?: string; status?: AiRequestRecord["status"] }): AiRequestRecord[] {
  return aiRequests
    .filter((row) => (filter?.userId ? row.userId === filter.userId : true))
    .filter((row) => (filter?.status ? row.status === filter.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAiRequestById(id: string): AiRequestRecord | undefined {
  return aiRequests.find((row) => row.id === id);
}

export function completeAiRequest(input: {
  id: string;
  responseSummary: string;
  model: string;
  completedAt: string;
}): AiRequestRecord | null {
  const row = getAiRequestById(input.id);
  if (!row) return null;
  row.status = "completed";
  row.responseSummary = input.responseSummary;
  row.model = input.model;
  row.completedAt = input.completedAt;
  addAuditEvent({
    action: "ai.request.completed",
    targetType: "ai_request",
    targetId: row.id,
    actor: "n8n-ai-worker",
    metadata: { model: input.model }
  });
  return row;
}

export function saveMarketplaceListing(record: MarketplaceListingRecord): MarketplaceListingRecord {
  listings.push(record);
  addAuditEvent({
    action: "marketplace.listing.created",
    targetType: "marketplace_listing",
    targetId: record.id,
    actor: record.postedBy,
    metadata: { type: record.type, status: record.status }
  });
  return record;
}

export function listMarketplaceListings(filter?: {
  postedBy?: string;
  status?: MarketplaceListingRecord["status"];
}): MarketplaceListingRecord[] {
  return listings
    .filter((row) => (filter?.postedBy ? row.postedBy === filter.postedBy : true))
    .filter((row) => (filter?.status ? row.status === filter.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDirectChatThreadByUsers(input: {
  userA: string;
  userB: string;
}): ChatThreadRecord | undefined {
  const pair = normalizePair(input.userA, input.userB);
  return chatThreads.find(
    (row) => row.kind === "direct" && row.participantA === pair.participantA && row.participantB === pair.participantB
  );
}

export function getChatThreadById(id: string): ChatThreadRecord | undefined {
  return chatThreads.find((row) => row.id === id);
}

export function saveChatThread(record: ChatThreadRecord): ChatThreadRecord {
  const existing = getChatThreadById(record.id);
  if (existing) {
    existing.status = record.status;
    existing.updatedAt = record.updatedAt;
    existing.lastMessageAt = record.lastMessageAt;
    existing.lastMessageBy = record.lastMessageBy;
    existing.lastMessagePreview = record.lastMessagePreview;
    return existing;
  }

  const pair = normalizePair(record.participantA, record.participantB);
  const created: ChatThreadRecord = {
    ...record,
    participantA: pair.participantA,
    participantB: pair.participantB
  };
  chatThreads.push(created);
  addAuditEvent({
    action: "chat.thread.opened",
    targetType: "chat_thread",
    targetId: created.id,
    actor: created.openedBy,
    metadata: {
      kind: created.kind,
      participantA: created.participantA,
      participantB: created.participantB
    }
  });
  return created;
}

export function listChatThreadsByUser(userId: string): ChatThreadRecord[] {
  return chatThreads
    .filter((row) => row.participantA === userId || row.participantB === userId)
    .sort((a, b) => {
      const aKey = a.lastMessageAt ?? a.updatedAt;
      const bKey = b.lastMessageAt ?? b.updatedAt;
      return bKey.localeCompare(aKey);
    });
}

export function saveChatMessage(record: ChatMessageRecord): ChatMessageRecord {
  chatMessages.push(record);
  const thread = getChatThreadById(record.threadId);
  if (thread) {
    thread.updatedAt = record.createdAt;
    thread.lastMessageAt = record.createdAt;
    thread.lastMessageBy = record.senderUserId;
    thread.lastMessagePreview = record.content.slice(0, 200);
  }
  addAuditEvent({
    action: "chat.message.sent",
    targetType: "chat_message",
    targetId: record.id,
    actor: record.senderUserId,
    metadata: {
      threadId: record.threadId
    }
  });
  return record;
}

export function listChatMessages(input: {
  threadId: string;
  limit?: number;
}): ChatMessageRecord[] {
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.floor(input.limit!))) : 80;
  return chatMessages
    .filter((row) => row.threadId === input.threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-safeLimit);
}

export function hasProcessedWebhookKey(key: string): boolean {
  return processedWebhookKeys.has(key);
}

export function markWebhookKeyProcessed(key: string): void {
  processedWebhookKeys.add(key);
}

export function hasProcessedEventId(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

export function markEventIdProcessed(eventId: string): void {
  processedEventIds.add(eventId);
}

export function addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }): AuditEvent {
  const row: AuditEvent = {
    id: event.id ?? randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    actor: event.actor,
    metadata: event.metadata
  };
  auditEvents.push(row);
  return row;
}

export function listAuditEvents(limit = 200): AuditEvent[] {
  return [...auditEvents]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function upsertUserAccount(input: {
  email: string;
  displayName?: string;
  companyName?: string;
  role?: UserAccountRecord["role"];
  accessLevel?: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  isVip?: boolean;
}): UserAccountRecord {
  const email = input.email.trim().toLowerCase();
  const existing = users.find((user) => user.email === email);

  if (existing) {
    existing.displayName = input.displayName?.trim() || existing.displayName;
    existing.companyName = input.companyName?.trim() || existing.companyName;
    existing.role = input.role ?? existing.role;
    existing.accessLevel = input.accessLevel ?? existing.accessLevel;
    existing.verificationStatus = input.verificationStatus ?? existing.verificationStatus;
    if (typeof input.isVip === "boolean") existing.isVip = input.isVip;
    existing.updatedAt = nowIso();
    return existing;
  }

  const created: UserAccountRecord = {
    userId: randomUUID(),
    email,
    displayName: input.displayName?.trim() || toDisplayName(email),
    companyName: input.companyName?.trim() || undefined,
    role: input.role ?? "applicant",
    accessLevel: input.accessLevel ?? "explorer",
    verificationStatus: input.verificationStatus ?? "none",
    isVip: input.isVip ?? false,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  users.push(created);

  addAuditEvent({
    action: "user.account.created",
    targetType: "user",
    targetId: created.userId,
    actor: "system",
    metadata: {
      email: created.email,
      role: created.role,
      accessLevel: created.accessLevel
    }
  });

  return created;
}

export function getUserByEmail(email: string): UserAccountRecord | undefined {
  return users.find((user) => user.email === email.trim().toLowerCase());
}

export function getUserById(userId: string): UserAccountRecord | undefined {
  return users.find((user) => user.userId === userId);
}

export function listUsers(filter?: {
  role?: UserAccountRecord["role"];
  verificationStatus?: UserAccountRecord["verificationStatus"];
  query?: string;
  limit?: number;
}): Array<
  UserAccountRecord & {
    magicLinksTotal: number;
    magicLinksActive: number;
    lastMagicLinkAt?: string;
    lastMagicLinkUsedAt?: string;
    lastMagicLinkExpiresAt?: string;
  }
> {
  const safeLimit = Number.isFinite(filter?.limit) ? Math.max(1, Math.min(1000, Math.floor(filter!.limit!))) : 400;
  const term = filter?.query?.trim().toLowerCase();
  const now = Date.now();

  return users
    .filter((user) => (filter?.role ? user.role === filter.role : true))
    .filter((user) => (filter?.verificationStatus ? user.verificationStatus === filter.verificationStatus : true))
    .filter((user) => {
      if (!term) return true;
      const hay = `${user.email} ${user.displayName ?? ""}`.toLowerCase();
      return hay.includes(term);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, safeLimit)
    .map((user) => {
      const rows = magicLinks.filter((link) => link.userId === user.userId);
      const active = rows.filter((link) => !link.usedAt && new Date(link.expiresAt).getTime() > now).length;
      const sortedByCreated = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const sortedByUsed = [...rows]
        .filter((row) => !!row.usedAt)
        .sort((a, b) => String(b.usedAt).localeCompare(String(a.usedAt)));
      const sortedByExpires = [...rows].sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));

      return {
        ...user,
        magicLinksTotal: rows.length,
        magicLinksActive: active,
        lastMagicLinkAt: sortedByCreated[0]?.createdAt,
        lastMagicLinkUsedAt: sortedByUsed[0]?.usedAt,
        lastMagicLinkExpiresAt: sortedByExpires[0]?.expiresAt
      };
    });
}

export function setUserVipStatus(userId: string, isVip: boolean): void {
  const user = getUserById(userId);
  if (user) { user.isVip = isVip; user.updatedAt = nowIso(); }
}

export function getUserVipStatus(userId: string): boolean {
  return Boolean(getUserById(userId)?.isVip);
}

export function issueActivityCredits(input: {
  userId: string;
  type: CreditTransactionType;
  amount: number;
  reason: string;
}): CreditTransaction {
  const now = nowIso();
  if (input.type !== "activity_reward") {
    const existing = credits.find((c) => c.userId === input.userId && c.type === input.type);
    if (existing) return { id: randomUUID(), userId: input.userId, type: input.type, amount: 0, reason: "already_issued", createdAt: now };
  }
  const tx: CreditTransaction = { id: randomUUID(), userId: input.userId, type: input.type, amount: input.amount, reason: input.reason, createdAt: now };
  credits.push(tx);
  return tx;
}

export function updateUserById(input: {
  userId: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  role?: UserAccountRecord["role"];
  accessLevel?: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  isVip?: boolean;
}): UserAccountRecord | null {
  const user = getUserById(input.userId);
  if (!user) return null;
  if (typeof input.displayName === "string") {
    user.displayName = input.displayName.trim() || user.displayName;
  }
  if (typeof input.companyName === "string") {
    user.companyName = input.companyName.trim() || user.companyName;
  }
  if (typeof input.industry === "string") {
    user.industry = input.industry.trim() || user.industry;
  }
  if (typeof input.avatarUrl === "string") {
    user.avatarUrl = input.avatarUrl.trim() || user.avatarUrl;
  }
  if (input.role) user.role = input.role;
  if (input.accessLevel) user.accessLevel = input.accessLevel;
  if (input.verificationStatus) user.verificationStatus = input.verificationStatus;
  if (typeof input.isVip === "boolean") user.isVip = input.isVip;
  user.updatedAt = nowIso();

  addAuditEvent({
    action: "user.account.updated",
    targetType: "user",
    targetId: user.userId,
    actor: "admin",
    metadata: {
      role: user.role,
      accessLevel: user.accessLevel,
      verificationStatus: user.verificationStatus
    }
  });

  return user;
}

export function deleteUserById(input: {
  userId: string;
  removedBy: string;
}): UserAccountRecord | null {
  const index = users.findIndex((user) => user.userId === input.userId);
  if (index < 0) return null;
  const removed = users[index];

  pruneArray(accessRequests, (row) => row.email.trim().toLowerCase() === removed.email);
  pruneArray(credits, (row) => row.userId === removed.userId);
  pruneArray(upgrades, (row) => row.userId === removed.userId);
  pruneArray(aiRequests, (row) => row.userId === removed.userId);
  pruneArray(listings, (row) => row.postedBy === removed.userId);

  const impactedThreadIds = new Set(
    chatThreads
      .filter((row) => row.participantA === removed.userId || row.participantB === removed.userId)
      .map((row) => row.id)
  );
  pruneArray(chatMessages, (row) => row.senderUserId === removed.userId || impactedThreadIds.has(row.threadId));
  pruneArray(chatThreads, (row) => row.participantA === removed.userId || row.participantB === removed.userId);

  pruneArray(magicLinks, (row) => row.userId === removed.userId);
  pruneArray(sessions, (row) => row.userId === removed.userId);
  users.splice(index, 1);

  addAuditEvent({
    action: "user.account.deleted",
    targetType: "user",
    targetId: removed.userId,
    actor: input.removedBy,
    metadata: {
      email: removed.email
    }
  });

  return removed;
}

export function setUserRoleAndAccessByEmail(input: {
  email: string;
  role: UserAccountRecord["role"];
  accessLevel: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
}): UserAccountRecord | null {
  const user = getUserByEmail(input.email);
  if (!user) return null;
  user.role = input.role;
  user.accessLevel = input.accessLevel;
  user.verificationStatus = input.verificationStatus ?? user.verificationStatus;
  user.updatedAt = nowIso();
  return user;
}

export function createMagicLink(input: {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  requestedIp?: string;
  requestedUserAgent?: string;
}): void {
  magicLinks.push({
    id: randomUUID(),
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
    requestedIp: input.requestedIp,
    requestedUserAgent: input.requestedUserAgent
  });
}

export function consumeMagicLink(providedHash: string, consumedAt: string): UserAccountRecord | null {
  const row = magicLinks.find(
    (item) =>
      item.tokenHash === providedHash &&
      !item.usedAt &&
      new Date(item.expiresAt).getTime() > new Date(consumedAt).getTime()
  );
  if (!row) return null;
  row.usedAt = consumedAt;
  return getUserById(row.userId) ?? null;
}

export function listMagicLinksByUserId(input: {
  userId: string;
  limit?: number;
}): Array<{
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  requestedIp?: string;
  requestedUserAgent?: string;
}> {
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(300, Math.floor(input.limit!))) : 50;
  return magicLinks
    .filter((row) => row.userId === input.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, safeLimit)
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.email,
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      requestedIp: row.requestedIp,
      requestedUserAgent: row.requestedUserAgent
    }));
}

export function createSession(input: {
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}): void {
  sessions.push({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    lastSeenAt: input.createdAt,
    ip: input.ip,
    userAgent: input.userAgent
  });
}

export function getSessionByToken(token: string): SessionUserRecord | null {
  const providedHash = tokenHash(token);
  const now = Date.now();
  const row = sessions.find((item) => {
    if (item.tokenHash !== providedHash) return false;
    if (item.revokedAt) return false;
    return new Date(item.expiresAt).getTime() > now;
  });
  if (!row) return null;
  row.lastSeenAt = nowIso();

  const user = getUserById(row.userId);
  if (!user) return null;
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    companyName: user.companyName,
    role: user.role,
    accessLevel: user.accessLevel,
    verificationStatus: user.verificationStatus,
    isVip: user.isVip ?? false
  };
}

export function revokeSessionByToken(token: string, revokedAt: string): void {
  const providedHash = tokenHash(token);
  const row = sessions.find((item) => item.tokenHash === providedHash && !item.revokedAt);
  if (!row) return;
  row.revokedAt = revokedAt;
}

export function getNetworkGraph(input: {
  userId: string;
  limit?: number;
}): { nodes: NetworkGraphNode[]; edges: NetworkGraphEdge[] } {
  const limit = Math.max(6, Math.min(input.limit ?? 24, 80));
  const user = getUserById(input.userId);

  const nodes: NetworkGraphNode[] = [];
  const userCompany = user?.companyName || user?.displayName || toDisplayName(user?.email ?? "you@balea-sphere8.com");
  nodes.push({
    id: `user:${input.userId}`,
    type: "user",
    label: userCompany,
    company: userCompany,
    summary: "Your business at the centre of the network",
    heat: 100,
    x: 50,
    y: 50,
    status: user?.accessLevel ?? "explorer",
    targetUserId: input.userId,
    targetEmail: user?.email,
    verification: user?.verificationStatus ?? "none",
    trustScore: user?.verificationStatus === "verified" ? 90 : user?.verificationStatus === "pending" ? 55 : 35,
    isVip: user?.isVip ?? false
  });

  users
    .filter((member) => member.userId !== input.userId)
    .filter((member) => member.verificationStatus === "verified")
    .filter((member) =>
      ["member", "verified_member", "premium_member", "circle_member", "moderator", "admin", "super_admin"].includes(
        member.role
      )
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit - 1)
    .forEach((member, index) => {
      const memberCompany = member.companyName || member.displayName || toDisplayName(member.email);
      nodes.push({
        id: `member:${member.userId}`,
        type: "user",
        label: memberCompany,
        company: memberCompany,
        summary: `${member.isVip ? "VIP Member" : "Verified Member"} · ${member.accessLevel.replaceAll("_", " ")}`,
        heat: Math.max(36, 82 - index * 4),
        x: 8 + (index % 6) * 14,
        y: 10 + Math.floor(index / 6) * 14,
        status: member.accessLevel,
        targetUserId: member.userId,
        targetEmail: member.email,
        verification: member.verificationStatus,
        trustScore: member.verificationStatus === "verified" ? 88 : 58,
        isVip: member.isVip ?? false
      });
    });

  const deduped = nodes.slice(0, limit).reduce<NetworkGraphNode[]>((acc, item) => {
    if (!acc.some((node) => node.id === item.id)) acc.push(item);
    return acc;
  }, []);

  const edges: NetworkGraphEdge[] = deduped
    .filter((node) => node.id !== `user:${input.userId}`)
    .map((node, index) => ({
      id: `edge:${input.userId}:${index}:${node.id}`,
      source: `user:${input.userId}`,
      target: node.id,
      relation: "core" as const,
      strength: Math.max(35, Math.min(100, node.heat))
    }));

  return { nodes: deduped, edges };
}


// ─── Push Tokens ────────────────────────────────────────────────────────────

type PushToken = {
  id: string;
  userId: string;
  deviceToken: string;
  platform: "ios" | "android";
  createdAt: string;
};

const pushTokens: PushToken[] = [];

export async function savePushToken(token: PushToken): Promise<void> {
  const idx = pushTokens.findIndex(t => t.userId === token.userId && t.deviceToken === token.deviceToken);
  if (idx >= 0) {
    pushTokens[idx] = token;
  } else {
    pushTokens.push(token);
  }
}

export async function deletePushToken(userId: string, deviceToken: string): Promise<void> {
  const idx = pushTokens.findIndex(t => t.userId === userId && t.deviceToken === deviceToken);
  if (idx >= 0) pushTokens.splice(idx, 1);
}

export async function getPushTokensByUserId(userId: string): Promise<PushToken[]> {
  return pushTokens.filter(t => t.userId === userId);
}

export async function savePitch(pitch: {
  id: string; senderId: string; recipientId: string;
  title: string; summary: string; deckUrl?: string; ask: string;
  creditsCharged: number; createdAt: string;
}): Promise<{ id: string; senderId: string; recipientId: string; title: string; summary: string; deckUrl?: string; ask: string; status: string; creditsCharged: number; createdAt: string; updatedAt: string; }> {
  return { ...pitch, status: "pending", updatedAt: pitch.createdAt };
}

export async function listPitchesByRecipient(_recipientId: string): Promise<Array<{ id: string; senderId: string; senderName?: string; senderCompany?: string; title: string; summary: string; ask: string; status: string; creditsCharged: number; createdAt: string; }>> {
  return [];
}

export async function updatePitchStatus(_id: string, _status: 'accepted' | 'declined'): Promise<void> {
  return;
}

export async function countPendingPitches(_recipientId: string): Promise<number> {
  return 0;
}
