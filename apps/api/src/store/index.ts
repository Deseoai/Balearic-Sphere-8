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
  EventAttendee,
  EventRecord,
  MarketplaceListingRecord,
  NetworkGraphEdge,
  NetworkGraphNode,
  SessionUserRecord,
  UserAccountRecord
} from "@mallorca/shared";
import { env } from "../config.js";
import * as memory from "./inMemory.js";
import * as postgres from "./postgres.js";

const usePostgres = env.DATA_BACKEND === "postgres";

type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type UpsertUserInput = {
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  role?: UserAccountRecord["role"];
  accessLevel?: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  isVip?: boolean;
};

type CreateMagicLinkInput = {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  requestedIp?: string;
  requestedUserAgent?: string;
};

type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
};

type AdminUserRecord = UserAccountRecord & {
  magicLinksTotal: number;
  magicLinksActive: number;
  lastMagicLinkAt?: string;
  lastMagicLinkUsedAt?: string;
  lastMagicLinkExpiresAt?: string;
};

type AdminMagicLinkRecord = {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  requestedIp?: string;
  requestedUserAgent?: string;
};

export async function initStore(): Promise<void> {
  if (usePostgres) {
    await postgres.initPostgresStore();
  }
}

export async function saveAccessRequest(record: AccessRequestRecord): Promise<AccessRequestRecord> {
  return usePostgres ? postgres.saveAccessRequest(record) : memory.saveAccessRequest(record);
}

export async function listAccessRequests(filter?: { status?: AccessRequestStatus }): Promise<AccessRequestRecord[]> {
  return usePostgres ? postgres.listAccessRequests(filter) : memory.listAccessRequests(filter);
}

export async function getAccessRequestById(id: string): Promise<AccessRequestRecord | undefined> {
  return usePostgres ? postgres.getAccessRequestById(id) : memory.getAccessRequestById(id);
}

export async function reviewAccessRequest(input: {
  id: string;
  status: AccessRequestStatus;
  humanScore?: number;
  recommendedAccessLevel?: AccessLevel;
  adminNotes?: string;
  reviewedBy: string;
  reviewedAt: string;
}): Promise<AccessRequestRecord | null> {
  return usePostgres ? postgres.reviewAccessRequest(input) : memory.reviewAccessRequest(input);
}

export async function applyReviewedApplicationCallback(input: {
  applicationId: string;
  status: AccessRequestStatus;
  humanScore?: number;
  recommendedAccessLevel?: AccessLevel;
  adminNotes?: string;
  reviewedAt: string;
  reviewedBy: string;
}): Promise<AccessRequestRecord> {
  return usePostgres
    ? postgres.applyReviewedApplicationCallback(input)
    : memory.applyReviewedApplicationCallback(input);
}

export async function addCreditTransaction(tx: CreditTransaction): Promise<CreditTransaction> {
  return usePostgres ? postgres.addCreditTransaction(tx) : memory.addCreditTransaction(tx);
}

export async function listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
  return usePostgres ? postgres.listCreditTransactions(userId) : memory.listCreditTransactions(userId);
}

export async function sumCreditBalance(userId: string): Promise<number> {
  return usePostgres ? postgres.sumCreditBalance(userId) : memory.sumCreditBalance(userId);
}

export async function issueWelcomeCredits(userId: string): Promise<CreditTransaction[]> {
  return usePostgres ? postgres.issueWelcomeCredits(userId) : memory.issueWelcomeCredits(userId);
}

export async function saveCircleUpgradeRequest(
  record: CircleUpgradeRequestRecord
): Promise<CircleUpgradeRequestRecord> {
  return usePostgres ? postgres.saveCircleUpgradeRequest(record) : memory.saveCircleUpgradeRequest(record);
}

export async function listCircleUpgradeRequests(filter?: {
  userId?: string;
  status?: CircleUpgradeStatus;
}): Promise<CircleUpgradeRequestRecord[]> {
  return usePostgres ? postgres.listCircleUpgradeRequests(filter) : memory.listCircleUpgradeRequests(filter);
}

export async function getCircleUpgradeRequestById(
  id: string
): Promise<CircleUpgradeRequestRecord | undefined> {
  return usePostgres ? postgres.getCircleUpgradeRequestById(id) : memory.getCircleUpgradeRequestById(id);
}

export async function reviewCircleUpgradeRequest(input: {
  id: string;
  status: CircleUpgradeStatus;
  reviewedBy: string;
  reviewedAt: string;
  decisionNotes?: string;
}): Promise<CircleUpgradeRequestRecord | null> {
  return usePostgres ? postgres.reviewCircleUpgradeRequest(input) : memory.reviewCircleUpgradeRequest(input);
}

export async function applyReviewedUpgradeCallback(input: {
  requestId: string;
  status: CircleUpgradeStatus;
  reviewedAt: string;
  reviewedBy: string;
  reason?: string;
}): Promise<CircleUpgradeRequestRecord> {
  return usePostgres ? postgres.applyReviewedUpgradeCallback(input) : memory.applyReviewedUpgradeCallback(input);
}

export async function saveAiRequest(record: AiRequestRecord): Promise<AiRequestRecord> {
  return usePostgres ? postgres.saveAiRequest(record) : memory.saveAiRequest(record);
}

export async function listAiRequests(filter?: {
  userId?: string;
  status?: AiRequestRecord["status"];
}): Promise<AiRequestRecord[]> {
  return usePostgres ? postgres.listAiRequests(filter) : memory.listAiRequests(filter);
}

export async function getAiRequestById(id: string): Promise<AiRequestRecord | undefined> {
  return usePostgres ? postgres.getAiRequestById(id) : memory.getAiRequestById(id);
}

export async function completeAiRequest(input: {
  id: string;
  responseSummary: string;
  model: string;
  completedAt: string;
}): Promise<AiRequestRecord | null> {
  return usePostgres ? postgres.completeAiRequest(input) : memory.completeAiRequest(input);
}

export async function saveMarketplaceListing(
  record: MarketplaceListingRecord
): Promise<MarketplaceListingRecord> {
  return usePostgres ? postgres.saveMarketplaceListing(record) : memory.saveMarketplaceListing(record);
}

export async function listMarketplaceListings(filter?: {
  postedBy?: string;
  status?: MarketplaceListingRecord["status"];
}): Promise<MarketplaceListingRecord[]> {
  return usePostgres ? postgres.listMarketplaceListings(filter) : memory.listMarketplaceListings(filter);
}

export async function getDirectChatThreadByUsers(input: {
  userA: string;
  userB: string;
}): Promise<ChatThreadRecord | undefined> {
  return usePostgres ? postgres.getDirectChatThreadByUsers(input) : memory.getDirectChatThreadByUsers(input);
}

export async function getChatThreadById(id: string): Promise<ChatThreadRecord | undefined> {
  return usePostgres ? postgres.getChatThreadById(id) : memory.getChatThreadById(id);
}

export async function saveChatThread(record: ChatThreadRecord): Promise<ChatThreadRecord> {
  return usePostgres ? postgres.saveChatThread(record) : memory.saveChatThread(record);
}

export async function listChatThreadsByUser(userId: string): Promise<ChatThreadRecord[]> {
  return usePostgres ? postgres.listChatThreadsByUser(userId) : memory.listChatThreadsByUser(userId);
}

export async function saveChatMessage(record: ChatMessageRecord): Promise<ChatMessageRecord> {
  return usePostgres ? postgres.saveChatMessage(record) : memory.saveChatMessage(record);
}

export async function listChatMessages(input: {
  threadId: string;
  limit?: number;
}): Promise<ChatMessageRecord[]> {
  return usePostgres ? postgres.listChatMessages(input) : memory.listChatMessages(input);
}

export async function hasProcessedWebhookKey(key: string): Promise<boolean> {
  return usePostgres ? postgres.hasProcessedWebhookKey(key) : memory.hasProcessedWebhookKey(key);
}

export async function markWebhookKeyProcessed(key: string): Promise<void> {
  if (usePostgres) {
    await postgres.markWebhookKeyProcessed(key);
    return;
  }
  memory.markWebhookKeyProcessed(key);
}

export async function hasProcessedEventId(eventId: string): Promise<boolean> {
  return usePostgres ? postgres.hasProcessedEventId(eventId) : memory.hasProcessedEventId(eventId);
}

export async function markEventIdProcessed(eventId: string): Promise<void> {
  if (usePostgres) {
    await postgres.markEventIdProcessed(eventId);
    return;
  }
  memory.markEventIdProcessed(eventId);
}

export async function addAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }
): Promise<AuditEvent> {
  return usePostgres ? postgres.addAuditEvent(event) : memory.addAuditEvent(event);
}

export async function listAuditEvents(limit = 200): Promise<AuditEvent[]> {
  return usePostgres ? postgres.listAuditEvents(limit) : memory.listAuditEvents(limit);
}

export async function upsertUserAccount(input: UpsertUserInput): Promise<UserAccountRecord> {
  return usePostgres ? postgres.upsertUserAccount(input) : memory.upsertUserAccount(input);
}

export async function getUserByEmail(email: string): Promise<UserAccountRecord | undefined> {
  return usePostgres ? postgres.getUserByEmail(email) : memory.getUserByEmail(email);
}

export async function getUserById(userId: string): Promise<UserAccountRecord | undefined> {
  return usePostgres ? postgres.getUserById(userId) : memory.getUserById(userId);
}

export async function listUsers(filter?: {
  role?: UserAccountRecord["role"];
  verificationStatus?: UserAccountRecord["verificationStatus"];
  query?: string;
  limit?: number;
}): Promise<AdminUserRecord[]> {
  return usePostgres ? postgres.listUsers(filter) : memory.listUsers(filter);
}

export async function updateUserById(input: {
  userId: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  role?: UserAccountRecord["role"];
  accessLevel?: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  isVip?: boolean;
}): Promise<UserAccountRecord | null> {
  return usePostgres ? postgres.updateUserById(input) : memory.updateUserById(input);
}

export async function setUserVipStatus(userId: string, isVip: boolean): Promise<void> {
  return usePostgres ? postgres.setUserVipStatus(userId, isVip) : memory.setUserVipStatus(userId, isVip);
}

export async function getUserVipStatus(userId: string): Promise<boolean> {
  return usePostgres ? postgres.getUserVipStatus(userId) : memory.getUserVipStatus(userId);
}

export async function issueActivityCredits(input: {
  userId: string;
  type: CreditTransaction["type"];
  amount: number;
  reason: string;
}): Promise<CreditTransaction> {
  return usePostgres ? postgres.issueActivityCredits(input) : memory.issueActivityCredits(input);
}

export async function deleteUserById(input: {
  userId: string;
  removedBy: string;
}): Promise<UserAccountRecord | null> {
  return usePostgres ? postgres.deleteUserById(input) : memory.deleteUserById(input);
}

export async function listMagicLinksByUserId(input: {
  userId: string;
  limit?: number;
}): Promise<AdminMagicLinkRecord[]> {
  return usePostgres ? postgres.listMagicLinksByUserId(input) : memory.listMagicLinksByUserId(input);
}

export async function setUserRoleAndAccessByEmail(input: {
  email: string;
  role: UserAccountRecord["role"];
  accessLevel: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  website?: string;
  annualRevenue?: string;
}): Promise<UserAccountRecord | null> {
  return usePostgres ? postgres.setUserRoleAndAccessByEmail(input) : memory.setUserRoleAndAccessByEmail(input);
}

export async function createMagicLink(input: CreateMagicLinkInput): Promise<void> {
  if (usePostgres) {
    await postgres.createMagicLink(input);
    return;
  }
  memory.createMagicLink(input);
}

export async function consumeMagicLink(tokenHash: string, consumedAt: string): Promise<UserAccountRecord | null> {
  return usePostgres ? postgres.consumeMagicLink(tokenHash, consumedAt) : memory.consumeMagicLink(tokenHash, consumedAt);
}

export async function createSession(input: CreateSessionInput): Promise<void> {
  if (usePostgres) {
    await postgres.createSession(input);
    return;
  }
  memory.createSession(input);
}

export async function getSessionByToken(token: string): Promise<SessionUserRecord | null> {
  return usePostgres ? postgres.getSessionByToken(token) : memory.getSessionByToken(token);
}

export async function revokeSessionByToken(token: string, revokedAt: string): Promise<void> {
  if (usePostgres) {
    await postgres.revokeSessionByToken(token, revokedAt);
    return;
  }
  memory.revokeSessionByToken(token, revokedAt);
}

export async function getNetworkGraph(input: {
  userId: string;
  limit?: number;
}): Promise<{ nodes: NetworkGraphNode[]; edges: NetworkGraphEdge[] }> {
  return usePostgres ? postgres.getNetworkGraph(input) : memory.getNetworkGraph(input);
}

export async function savePitch(pitch: {
  id: string; senderId: string; recipientId: string;
  title: string; summary: string; deckUrl?: string; ask: string;
  creditsCharged: number; createdAt: string;
}): Promise<{ id: string; senderId: string; recipientId: string; title: string; summary: string; deckUrl?: string; ask: string; status: string; creditsCharged: number; createdAt: string; updatedAt: string; }> {
  return usePostgres ? postgres.savePitch(pitch) : memory.savePitch(pitch);
}

export async function listPitchesByRecipient(recipientId: string): Promise<Array<{ id: string; senderId: string; senderName?: string; senderCompany?: string; title: string; summary: string; ask: string; status: string; creditsCharged: number; createdAt: string; }>> {
  return usePostgres ? postgres.listPitchesByRecipient(recipientId) : memory.listPitchesByRecipient(recipientId);
}

export async function getPitchById(id: string): Promise<{ id: string; senderId: string; recipientId: string; status: string } | undefined> {
  return usePostgres ? postgres.getPitchById(id) : undefined;
}

export async function updatePitchStatus(id: string, status: 'accepted' | 'declined'): Promise<void> {
  return usePostgres ? postgres.updatePitchStatus(id, status) : memory.updatePitchStatus(id, status);
}

export async function countPendingPitches(recipientId: string): Promise<number> {
  return usePostgres ? postgres.countPendingPitches(recipientId) : memory.countPendingPitches(recipientId);
}

export async function incrementSignalScore(userId: string, delta: number): Promise<void> {
  return usePostgres ? postgres.incrementSignalScore(userId, delta) : Promise.resolve();
}

export async function recalculateTrustScore(userId: string): Promise<number> {
  return usePostgres ? postgres.recalculateTrustScore(userId) : Promise.resolve(20);
}

export async function addTrustBonus(userId: string, bonus: number): Promise<void> {
  return usePostgres ? postgres.addTrustBonus(userId, bonus) : Promise.resolve();
}

export async function recordProfileView(viewedUserId: string): Promise<number> {
  return usePostgres ? postgres.recordProfileView(viewedUserId) : Promise.resolve(0);
}

export async function getProfileViewCount(userId: string): Promise<number> {
  return usePostgres ? postgres.getProfileViewCount(userId) : Promise.resolve(0);
}

export async function saveEvent(record: EventRecord): Promise<EventRecord> {
  return usePostgres ? postgres.saveEvent(record) : Promise.resolve(record);
}

export async function listEvents(filter?: { status?: string; postedBy?: string }): Promise<EventRecord[]> {
  return usePostgres ? postgres.listEvents(filter) : Promise.resolve([]);
}

export async function getEventById(id: string): Promise<(EventRecord & { attendees: EventAttendee[] }) | undefined> {
  return usePostgres ? postgres.getEventById(id) : Promise.resolve(undefined);
}

export async function cancelEvent(id: string, userId: string): Promise<EventRecord | null> {
  return usePostgres ? postgres.cancelEvent(id, userId) : Promise.resolve(null);
}

export async function rsvpEvent(eventId: string, userId: string, rsvpId: string): Promise<void> {
  return usePostgres ? postgres.rsvpEvent(eventId, userId, rsvpId) : Promise.resolve();
}

export async function cancelRsvp(eventId: string, userId: string): Promise<void> {
  return usePostgres ? postgres.cancelRsvp(eventId, userId) : Promise.resolve();
}

export async function getUserRsvp(eventId: string, userId: string): Promise<boolean> {
  return usePostgres ? postgres.getUserRsvp(eventId, userId) : Promise.resolve(false);
}

export async function getUsersByIndustry(industry: string): Promise<Array<{ companyName?: string; displayName?: string; industry?: string }>> {
  return usePostgres ? postgres.getUsersByIndustry(industry) : Promise.resolve([]);
}

export async function getOrCreateReferralCode(userId: string, isVip: boolean): Promise<{ code: string; uses: number }> {
  return usePostgres ? postgres.getOrCreateReferralCode(userId, isVip) : Promise.resolve({ code: "DEMO1234", uses: 0 });
}

export async function applyReferralCode(code: string, newUserId: string): Promise<{ referrerId: string; referrerReward: number; newUserReward: number } | null> {
  return usePostgres ? postgres.applyReferralCode(code, newUserId) : Promise.resolve(null);
}

export async function setUserEliteStatus(userId: string, isElite: boolean): Promise<void> {
  return usePostgres ? postgres.setUserEliteStatus(userId, isElite) : Promise.resolve();
}

export async function getUserEliteStatus(userId: string): Promise<boolean> {
  return usePostgres ? postgres.getUserEliteStatus(userId) : Promise.resolve(false);
}

export async function listEliteMembers(): Promise<UserAccountRecord[]> {
  return usePostgres ? postgres.listEliteMembers() : Promise.resolve([]);
}

export async function saveEliteMessage(msg: { id: string; userId: string; displayName?: string; avatarUrl?: string; content: string }): Promise<void> {
  return usePostgres ? postgres.saveEliteMessage(msg) : Promise.resolve();
}

export async function listEliteMessages(limit?: number): Promise<Array<{ id: string; userId: string; displayName?: string; avatarUrl?: string; content: string; createdAt: string }>> {
  return usePostgres ? postgres.listEliteMessages(limit) : Promise.resolve([]);
}

export async function deleteEliteMessagesBefore(cutoffIso: string): Promise<void> {
  return usePostgres ? postgres.deleteEliteMessagesBefore(cutoffIso) : Promise.resolve();
}
