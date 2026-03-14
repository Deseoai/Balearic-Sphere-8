export const IndustrySectors = [
  "technology",
  "real_estate",
  "hospitality",
  "finance",
  "investment",
  "fashion",
  "yachting",
  "arts",
  "wellness",
  "consulting",
  "legal",
  "media",
  "food_beverage",
  "events",
  "jewelry",
  "luxury_goods",
  "aviation",
  "architecture",
  "interior_design",
  "construction",
  "sports",
  "education",
  "healthcare",
  "agriculture",
  "crypto_blockchain",
  "sustainability",
  "photography_film",
  "retail",
  "logistics",
  "other"
] as const;
export type IndustrySector = (typeof IndustrySectors)[number];

export const AccessLevels = [
  "explorer",
  "curated",
  "verified",
  "insider",
  "private_circle_eligible"
] as const;

export type AccessLevel = (typeof AccessLevels)[number];

export const MemberRoles = [
  "public_visitor",
  "applicant",
  "member",
  "verified_member",
  "premium_member",
  "circle_member",
  "moderator",
  "admin",
  "super_admin"
] as const;

export type MemberRole = (typeof MemberRoles)[number];

export type UserAccountRecord = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  website?: string;
  annualRevenue?: string;
  role: MemberRole;
  accessLevel: AccessLevel;
  verificationStatus: "none" | "pending" | "verified" | "rejected";
  isVip?: boolean;
  isElite?: boolean;
  signalScore?: number;
  trustScore?: number;
  createdAt: string;
  updatedAt: string;
};

export type ReferralRecord = {
  code: string;
  userId: string;
  isVip: boolean;
  uses: number;
  createdAt: string;
};

export type EliteMessageRecord = {
  id: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
};

export type SessionUserRecord = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  role: MemberRole;
  accessLevel: AccessLevel;
  verificationStatus: UserAccountRecord["verificationStatus"];
  isVip?: boolean;
  isElite?: boolean;
};

export type NetworkGraphNode = {
  id: string;
  type: "user" | "listing" | "ai" | "circle";
  label: string;
  summary: string;
  heat: number;
  x: number;
  y: number;
  status?: string;
  targetUserId?: string;
  targetEmail?: string;
  company?: string;
  location?: string;
  industry?: string;
  website?: string;
  verification?: "none" | "pending" | "verified" | "rejected";
  trustScore?: number;
  isVip?: boolean;
  avatarUrl?: string;
  annualRevenue?: string;
};

export type NetworkGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "core" | "opportunity" | "insight" | "access";
  strength: number;
};

export const AccessRequestStatuses = [
  "under_review",
  "accepted",
  "rejected",
  "waitlisted"
] as const;

export type AccessRequestStatus = (typeof AccessRequestStatuses)[number];

export const ApplicantCategories = [
  "investor",
  "founder",
  "creator",
  "service",
  "hospitality",
  "real_estate",
  "advisor",
  "other"
] as const;

export type ApplicantCategory = (typeof ApplicantCategories)[number];

export const AnnualRevenueRanges = [
  "under_250k",
  "250k_to_1m",
  "1m_to_5m",
  "over_5m",
  "prefer_not_to_say"
] as const;

export type AnnualRevenueRange = (typeof AnnualRevenueRanges)[number];

export type AccessRequestPayload = {
  name: string;
  email: string;
  location: string;
  category: ApplicantCategory;
  industry?: IndustrySector;
  companyName?: string;
  annualRevenue?: AnnualRevenueRange;
  referralCode?: string;
  whatOffer: string;
  whatSeek: string;
  whyJoin: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
};

export type AccessRequestRecord = AccessRequestPayload & {
  id: string;
  createdAt: string;
  status: AccessRequestStatus;
  aiPreScore: number;
  recommendedAccessLevel: AccessLevel;
  humanScore?: number;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNotes?: string;
};

export type CreditTransactionType =
  | "welcome_bonus"
  | "profile_completion"
  | "verification_bonus"
  | "contribution_reward"
  | "invite_reward"
  | "referral_reward"
  | "activity_reward"
  | "spend_unlock"
  | "spend_ai"
  | "purchase"
  | "refund";

export type CreditTransaction = {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number;
  reason: string;
  createdAt: string;
};

export type WebhookEnvelope<T> = {
  event: string;
  eventId: string;
  emittedAt: string;
  data: T;
};

export const CircleUpgradeStatuses = [
  "under_review",
  "approved",
  "rejected",
  "waitlisted"
] as const;

export type CircleUpgradeStatus = (typeof CircleUpgradeStatuses)[number];

export type CircleUpgradeRequestRecord = {
  id: string;
  userId: string;
  circle: string;
  currentAccess: AccessLevel;
  status: CircleUpgradeStatus;
  aiSuitability: number;
  reason: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decisionNotes?: string;
};

export const AiPromptTypes = [
  "concierge",
  "matchmaking",
  "intro_engine",
  "profile_optimization",
  "deal_radar",
  "marketplace_assistant",
  "summary",
  "reputation_signal"
] as const;

export type AiPromptType = (typeof AiPromptTypes)[number];

export const AiRequestStatuses = ["queued", "running", "completed", "failed"] as const;

export type AiRequestStatus = (typeof AiRequestStatuses)[number];

export type AiRequestRecord = {
  id: string;
  userId: string;
  promptType: AiPromptType;
  prompt: string;
  status: AiRequestStatus;
  responseSummary?: string;
  model?: string;
  creditsUsed?: number;
  createdAt: string;
  completedAt?: string;
};

export const MarketplaceListingTypes = [
  "opportunity",
  "request",
  "offer",
  "collaboration",
  "premium_access",
  "event_seat",
  "strategic_need",
  "private_deal"
] as const;

export type MarketplaceListingType = (typeof MarketplaceListingTypes)[number];

export const MarketplaceListingStatuses = ["active", "paused", "closed"] as const;

export type MarketplaceListingStatus = (typeof MarketplaceListingStatuses)[number];

export type MarketplaceListingRecord = {
  id: string;
  postedBy: string;
  title: string;
  type: MarketplaceListingType;
  category: string;
  summary: string;
  description: string;
  visibility: "members" | "circle" | "private";
  status: MarketplaceListingStatus;
  creditsCost: number;
  trustRequirement: number;
  createdAt: string;
};

export const ChatThreadStatuses = ["active", "blocked", "archived"] as const;

export type ChatThreadStatus = (typeof ChatThreadStatuses)[number];

export type ChatThreadRecord = {
  id: string;
  kind: "direct";
  participantA: string;
  participantB: string;
  openedBy: string;
  status: ChatThreadStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessageBy?: string;
  lastMessagePreview?: string;
};

export type ChatMessageRecord = {
  id: string;
  threadId: string;
  senderUserId: string;
  content: string;
  createdAt: string;
};

export type AuditEventRecord = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const EventTopics = [
  "networking",
  "business",
  "investment",
  "lifestyle",
  "wellness",
  "social",
  "other"
] as const;
export type EventTopic = (typeof EventTopics)[number];

export const EventStatuses = ["published", "cancelled", "completed"] as const;
export type EventStatus = (typeof EventStatuses)[number];

export type EventRecord = {
  id: string;
  postedBy: string;
  postedByName?: string;
  postedByAvatarUrl?: string;
  title: string;
  topic: EventTopic;
  description: string;
  location: string;
  address?: string;
  link?: string;
  dateTime: string;
  endTime?: string;
  price: number;
  currency: string;
  maxAttendees?: number;
  status: EventStatus;
  rsvpCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type EventAttendee = {
  userId: string;
  displayName?: string;
  companyName?: string;
  avatarUrl?: string;
  joinedAt: string;
};
