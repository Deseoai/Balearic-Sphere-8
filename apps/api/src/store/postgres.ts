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
  EventAttendee,
  EventRecord,
  MarketplaceListingRecord,
  NetworkGraphEdge,
  NetworkGraphNode,
  SessionUserRecord,
  UserAccountRecord
} from "@mallorca/shared";
import { createHash, randomUUID } from "node:crypto";
import { Pool, type Pool as PgPool } from "pg";
import { env } from "../config.js";

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

let pool: PgPool | null = null;

function getPool(): PgPool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when DATA_BACKEND=postgres");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 12,
      idleTimeoutMillis: 30_000
    });
  }

  return pool;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function mapAccessRequest(row: Record<string, unknown>): AccessRequestRecord & { industry?: string } {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    location: String(row.location ?? ""),
    category: String(row.category ?? "other") as AccessRequestRecord["category"],
    industry: row.industry ? String(row.industry) as AccessRequestRecord["industry"] : undefined,
    companyName: row.company_name ? String(row.company_name) : undefined,
    annualRevenue: row.annual_revenue ? String(row.annual_revenue) as AccessRequestRecord["annualRevenue"] : undefined,
    referralCode: row.referral_code ? String(row.referral_code) : undefined,
    whatOffer: String(row.what_offer ?? ""),
    whatSeek: String(row.what_seek ?? ""),
    whyJoin: String(row.why_join ?? ""),
    website: row.website ? String(row.website) : undefined,
    linkedin: row.linkedin ? String(row.linkedin) : undefined,
    instagram: row.instagram ? String(row.instagram) : undefined,
    createdAt: toIso(row.created_at),
    status: String(row.status ?? "under_review") as AccessRequestStatus,
    aiPreScore: Number(row.ai_pre_score ?? 0),
    recommendedAccessLevel: String(row.recommended_access_level ?? "explorer") as AccessLevel,
    humanScore: row.human_score == null ? undefined : Number(row.human_score),
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    adminNotes: row.admin_notes ? String(row.admin_notes) : undefined
  };
}

function mapCreditTx(row: Record<string, unknown>): CreditTransaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: String(row.type) as CreditTransactionType,
    amount: Number(row.amount),
    reason: String(row.reason),
    createdAt: toIso(row.created_at)
  };
}

function mapCircleRequest(row: Record<string, unknown>): CircleUpgradeRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    circle: String(row.circle),
    currentAccess: String(row.current_access) as AccessLevel,
    status: String(row.status) as CircleUpgradeStatus,
    aiSuitability: Number(row.ai_suitability ?? 0),
    reason: String(row.reason ?? ""),
    createdAt: toIso(row.created_at),
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    decisionNotes: row.decision_notes ? String(row.decision_notes) : undefined
  };
}

function mapAiRequest(row: Record<string, unknown>): AiRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    promptType: String(row.prompt_type) as AiRequestRecord["promptType"],
    prompt: String(row.prompt),
    status: String(row.status) as AiRequestRecord["status"],
    responseSummary: row.response_summary ? String(row.response_summary) : undefined,
    model: row.model ? String(row.model) : undefined,
    createdAt: toIso(row.created_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : undefined
  };
}

function mapListing(row: Record<string, unknown>): MarketplaceListingRecord {
  return {
    id: String(row.id),
    postedBy: String(row.posted_by),
    title: String(row.title),
    type: String(row.type) as MarketplaceListingRecord["type"],
    category: String(row.category),
    summary: String(row.summary),
    description: String(row.description),
    visibility: String(row.visibility) as MarketplaceListingRecord["visibility"],
    status: String(row.status) as MarketplaceListingRecord["status"],
    creditsCost: Number(row.credits_cost ?? 0),
    trustRequirement: Number(row.trust_requirement ?? 0),
    createdAt: toIso(row.created_at)
  };
}

function mapChatThread(row: Record<string, unknown>): ChatThreadRecord {
  return {
    id: String(row.id),
    kind: "direct",
    participantA: String(row.participant_a),
    participantB: String(row.participant_b),
    openedBy: String(row.opened_by),
    status: String(row.status) as ChatThreadRecord["status"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastMessageAt: row.last_message_at ? toIso(row.last_message_at) : undefined,
    lastMessageBy: row.last_message_by ? String(row.last_message_by) : undefined,
    lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : undefined
  };
}

function mapChatMessage(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    senderUserId: String(row.sender_user_id),
    content: String(row.content ?? ""),
    createdAt: toIso(row.created_at)
  };
}

function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    actor: String(row.actor),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: toIso(row.created_at)
  };
}

function mapUser(row: Record<string, unknown>): UserAccountRecord {
  return {
    userId: String(row.id),
    email: String(row.email),
    displayName: row.display_name ? String(row.display_name) : undefined,
    companyName: row.company_name ? String(row.company_name) : undefined,
    industry: row.industry ? String(row.industry) : undefined,
    role: String(row.role ?? "applicant") as UserAccountRecord["role"],
    accessLevel: String(row.access_level ?? "explorer") as AccessLevel,
    verificationStatus: String(row.verification_status ?? "none") as UserAccountRecord["verificationStatus"],
    isVip: Boolean(row.is_vip),
    isElite: Boolean(row.is_elite),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    website: row.website ? String(row.website) : undefined,
    annualRevenue: row.annual_revenue ? String(row.annual_revenue) : undefined,
    signalScore: typeof row.signal_score === "number" ? row.signal_score : Number(row.signal_score ?? 0),
    trustScore: typeof row.trust_score === "number" ? row.trust_score : Number(row.trust_score ?? 20),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function shaToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizePair(userA: string, userB: string): { participantA: string; participantB: string } {
  return userA < userB
    ? { participantA: userA, participantB: userB }
    : { participantA: userB, participantB: userA };
}

export async function initPostgresStore(): Promise<void> {
  const db = getPool();
  await db.query(`
    create table if not exists app_access_requests (
      id text primary key,
      name text not null,
      email text not null,
      location text not null,
      category text not null,
      what_offer text not null,
      what_seek text not null,
      why_join text not null,
      website text,
      linkedin text,
      instagram text,
      created_at timestamptz not null,
      status text not null,
      ai_pre_score integer not null,
      recommended_access_level text not null,
      human_score integer,
      reviewed_at timestamptz,
      reviewed_by text,
      admin_notes text
    );

    create index if not exists app_access_requests_status_created_idx
      on app_access_requests(status, created_at desc);

    create table if not exists app_credit_transactions (
      id text primary key,
      user_id text not null,
      type text not null,
      amount integer not null,
      reason text not null,
      created_at timestamptz not null
    );

    create index if not exists app_credit_tx_user_created_idx
      on app_credit_transactions(user_id, created_at desc);

    create table if not exists app_circle_upgrades (
      id text primary key,
      user_id text not null,
      circle text not null,
      current_access text not null,
      status text not null,
      ai_suitability integer not null default 0,
      reason text not null,
      created_at timestamptz not null,
      reviewed_at timestamptz,
      reviewed_by text,
      decision_notes text
    );

    create index if not exists app_circle_upgrades_user_created_idx
      on app_circle_upgrades(user_id, created_at desc);

    create index if not exists app_circle_upgrades_status_created_idx
      on app_circle_upgrades(status, created_at desc);

    create table if not exists app_ai_requests (
      id text primary key,
      user_id text not null,
      prompt_type text not null,
      prompt text not null,
      status text not null,
      response_summary text,
      model text,
      created_at timestamptz not null,
      completed_at timestamptz
    );

    create index if not exists app_ai_requests_user_created_idx
      on app_ai_requests(user_id, created_at desc);

    create table if not exists app_marketplace_listings (
      id text primary key,
      posted_by text not null,
      title text not null,
      type text not null,
      category text not null,
      summary text not null,
      description text not null,
      visibility text not null,
      status text not null,
      credits_cost integer not null default 0,
      trust_requirement integer not null default 0,
      created_at timestamptz not null
    );

    create index if not exists app_marketplace_posted_created_idx
      on app_marketplace_listings(posted_by, created_at desc);

    create table if not exists app_chat_threads (
      id text primary key,
      kind text not null default 'direct',
      participant_a text not null,
      participant_b text not null,
      opened_by text not null,
      status text not null default 'active',
      created_at timestamptz not null,
      updated_at timestamptz not null,
      last_message_at timestamptz,
      last_message_by text,
      last_message_preview text
    );

    create unique index if not exists app_chat_threads_pair_unique_idx
      on app_chat_threads(participant_a, participant_b);

    create index if not exists app_chat_threads_participant_a_idx
      on app_chat_threads(participant_a, updated_at desc);

    create index if not exists app_chat_threads_participant_b_idx
      on app_chat_threads(participant_b, updated_at desc);

    create table if not exists app_chat_messages (
      id text primary key,
      thread_id text not null,
      sender_user_id text not null,
      content text not null,
      created_at timestamptz not null
    );

    create index if not exists app_chat_messages_thread_created_idx
      on app_chat_messages(thread_id, created_at asc);

    create table if not exists app_users (
      id text primary key,
      email text not null unique,
      display_name text,
      role text not null default 'applicant',
      access_level text not null default 'explorer',
      verification_status text not null default 'none',
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create index if not exists app_users_email_idx
      on app_users(lower(email));

    create table if not exists app_magic_links (
      id text primary key,
      user_id text not null,
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null,
      requested_ip text,
      requested_user_agent text
    );

    create index if not exists app_magic_links_expires_idx
      on app_magic_links(expires_at desc);

    create table if not exists app_sessions (
      id text primary key,
      user_id text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      created_at timestamptz not null,
      last_seen_at timestamptz not null,
      ip text,
      user_agent text
    );

    create index if not exists app_sessions_user_idx
      on app_sessions(user_id, created_at desc);

    create table if not exists app_processed_keys (
      key_type text not null,
      key_value text not null,
      created_at timestamptz not null default now(),
      primary key (key_type, key_value)
    );

    create table if not exists app_audit_events (
      id text primary key,
      action text not null,
      target_type text not null,
      target_id text not null,
      actor text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null
    );

    create index if not exists app_audit_created_idx
      on app_audit_events(created_at desc);
  `);

  // Non-destructive schema migrations
  await db.query(`
    alter table app_users add column if not exists is_vip boolean not null default false;
    alter table app_users add column if not exists company_name text;
    alter table app_access_requests add column if not exists annual_revenue text;
    alter table app_access_requests add column if not exists company_name text;
    alter table app_access_requests add column if not exists referral_code text;
    alter table app_access_requests add column if not exists industry text;
    alter table app_users add column if not exists industry text;
    alter table app_users add column if not exists avatar_url text;
    alter table app_users add column if not exists signal_score int not null default 0;
    alter table app_users add column if not exists trust_score int not null default 20;
    alter table app_users add column if not exists profile_view_count int not null default 0;
    alter table app_users add column if not exists website text;
    alter table app_users add column if not exists annual_revenue text;
    create table if not exists app_events (
      id text primary key,
      posted_by text not null references app_users(id) on delete cascade,
      title text not null,
      topic text not null default 'other',
      description text not null,
      location text not null,
      address text,
      link text,
      date_time timestamptz not null,
      end_time timestamptz,
      price numeric(10,2) not null default 0,
      currency text not null default 'EUR',
      max_attendees int,
      status text not null default 'published',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists app_event_rsvps (
      id text primary key,
      event_id text not null references app_events(id) on delete cascade,
      user_id text not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique(event_id, user_id)
    );
  `);

  await db.query(`
    alter table app_events add column if not exists link text;
    alter table app_users add column if not exists is_elite boolean not null default false;
    create table if not exists app_referrals (
      code text primary key,
      user_id text not null references app_users(id) on delete cascade,
      is_vip boolean not null default false,
      uses int not null default 0,
      created_at timestamptz not null default now()
    );
    create unique index if not exists app_referrals_user_idx on app_referrals(user_id);
    create table if not exists app_referral_uses (
      id text primary key,
      code text not null,
      used_by text not null references app_users(id) on delete cascade,
      credited_amount int not null,
      created_at timestamptz not null default now(),
      unique(used_by)
    );
    create table if not exists app_elite_messages (
      id text primary key,
      user_id text not null references app_users(id) on delete cascade,
      display_name text,
      avatar_url text,
      content text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists app_elite_messages_created_idx on app_elite_messages(created_at desc);
  `);

  await db.query(`
    create table if not exists pitches (
      id text primary key,
      sender_id text not null references app_users(id) on delete cascade,
      recipient_id text not null references app_users(id) on delete cascade,
      title text not null,
      summary text not null,
      deck_url text,
      ask text not null,
      status text not null default 'pending',
      credits_charged integer not null default 25,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`
    create index if not exists pitches_recipient_created_idx on pitches(recipient_id, created_at desc);
    create index if not exists pitches_sender_created_idx on pitches(sender_id, created_at desc);
  `);
}

export async function saveAccessRequest(record: AccessRequestRecord): Promise<AccessRequestRecord> {
  const db = getPool();
  await db.query(
    `
      insert into app_access_requests (
        id, name, email, location, category, what_offer, what_seek, why_join,
        website, linkedin, instagram, created_at, status, ai_pre_score,
        recommended_access_level, human_score, reviewed_at, reviewed_by, admin_notes,
        company_name, annual_revenue, referral_code, industry
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23
      )
    `,
    [
      record.id,
      record.name,
      record.email,
      record.location,
      record.category,
      record.whatOffer,
      record.whatSeek,
      record.whyJoin,
      record.website ?? null,
      record.linkedin ?? null,
      record.instagram ?? null,
      record.createdAt,
      record.status,
      record.aiPreScore,
      record.recommendedAccessLevel,
      record.humanScore ?? null,
      record.reviewedAt ?? null,
      record.reviewedBy ?? null,
      record.adminNotes ?? null,
      record.companyName ?? null,
      record.annualRevenue ?? null,
      record.referralCode ?? null,
      (record as AccessRequestRecord & { industry?: string }).industry ?? null
    ]
  );

  await addAuditEvent({
    action: "application.created",
    targetType: "application",
    targetId: record.id,
    actor: "system",
    metadata: { status: record.status, aiPreScore: record.aiPreScore }
  });

  return record;
}

export async function listAccessRequests(filter?: { status?: AccessRequestStatus }): Promise<AccessRequestRecord[]> {
  const db = getPool();
  const result = filter?.status
    ? await db.query("select * from app_access_requests where status = $1 order by created_at desc", [filter.status])
    : await db.query("select * from app_access_requests order by created_at desc");
  return result.rows.map((row) => mapAccessRequest(row));
}

export async function getAccessRequestById(id: string): Promise<AccessRequestRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_access_requests where id = $1 limit 1", [id]);
  if (result.rowCount === 0) return undefined;
  return mapAccessRequest(result.rows[0]);
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
  const db = getPool();
  const result = await db.query(
    `
      update app_access_requests
      set status = $2,
          human_score = $3,
          recommended_access_level = coalesce($4, recommended_access_level),
          reviewed_at = $5,
          reviewed_by = $6,
          admin_notes = $7
      where id = $1
      returning *
    `,
    [
      input.id,
      input.status,
      input.humanScore ?? null,
      input.recommendedAccessLevel ?? null,
      input.reviewedAt,
      input.reviewedBy,
      input.adminNotes ?? null
    ]
  );

  if (result.rowCount === 0) return null;

  const row = mapAccessRequest(result.rows[0]);
  await addAuditEvent({
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

export async function applyReviewedApplicationCallback(input: {
  applicationId: string;
  status: AccessRequestStatus;
  humanScore?: number;
  recommendedAccessLevel?: AccessLevel;
  adminNotes?: string;
  reviewedAt: string;
  reviewedBy: string;
}): Promise<AccessRequestRecord> {
  const existing = await getAccessRequestById(input.applicationId);
  if (!existing) {
    await saveAccessRequest({
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
    });
  }

  const reviewed = await reviewAccessRequest({
    id: input.applicationId,
    status: input.status,
    humanScore: input.humanScore,
    recommendedAccessLevel: input.recommendedAccessLevel,
    adminNotes: input.adminNotes,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt
  });

  return reviewed ?? (await getAccessRequestById(input.applicationId))!;
}

export async function addCreditTransaction(tx: CreditTransaction): Promise<CreditTransaction> {
  const db = getPool();
  await db.query(
    `insert into app_credit_transactions (id, user_id, type, amount, reason, created_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [tx.id, tx.userId, tx.type, tx.amount, tx.reason, tx.createdAt]
  );

  await addAuditEvent({
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

export async function listCreditTransactions(userId: string): Promise<CreditTransaction[]> {
  const db = getPool();
  const result = await db.query(
    "select * from app_credit_transactions where user_id = $1 order by created_at desc",
    [userId]
  );
  return result.rows.map((row) => mapCreditTx(row));
}

export async function sumCreditBalance(userId: string): Promise<number> {
  const db = getPool();
  const result = await db.query("select coalesce(sum(amount), 0) as balance from app_credit_transactions where user_id = $1", [
    userId
  ]);
  return Number(result.rows[0]?.balance ?? 0);
}

export async function issueWelcomeCredits(userId: string): Promise<CreditTransaction[]> {
  const now = new Date().toISOString();
  const entries: Array<{ amount: number; type: CreditTransactionType; reason: string }> = [
    { amount: 200, type: "welcome_bonus", reason: "Welcome to Balea Sphere — 200 complimentary credits" }
  ];

  const db = getPool();
  const existingResult = await db.query(
    "select type from app_credit_transactions where user_id = $1 and type = any($2::text[])",
    [userId, entries.map((entry) => entry.type)]
  );
  const existingTypes = new Set(existingResult.rows.map((row) => String(row.type)));

  const out: CreditTransaction[] = [];
  for (const entry of entries) {
    if (existingTypes.has(entry.type)) {
      continue;
    }
    out.push(
      await addCreditTransaction({
        id: randomUUID(),
        userId,
        amount: entry.amount,
        type: entry.type,
        reason: entry.reason,
        createdAt: now
      })
    );
  }
  return out;
}

export async function saveCircleUpgradeRequest(
  record: CircleUpgradeRequestRecord
): Promise<CircleUpgradeRequestRecord> {
  const db = getPool();
  await db.query(
    `
      insert into app_circle_upgrades (
        id, user_id, circle, current_access, status, ai_suitability,
        reason, created_at, reviewed_at, reviewed_by, decision_notes
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11
      )
    `,
    [
      record.id,
      record.userId,
      record.circle,
      record.currentAccess,
      record.status,
      record.aiSuitability,
      record.reason,
      record.createdAt,
      record.reviewedAt ?? null,
      record.reviewedBy ?? null,
      record.decisionNotes ?? null
    ]
  );

  await addAuditEvent({
    action: "circle.access.requested",
    targetType: "circle_upgrade",
    targetId: record.id,
    actor: record.userId,
    metadata: { circle: record.circle, aiSuitability: record.aiSuitability }
  });

  return record;
}

export async function listCircleUpgradeRequests(filter?: {
  userId?: string;
  status?: CircleUpgradeStatus;
}): Promise<CircleUpgradeRequestRecord[]> {
  const db = getPool();
  const where: string[] = [];
  const params: string[] = [];

  if (filter?.userId) {
    params.push(filter.userId);
    where.push(`user_id = $${params.length}`);
  }

  if (filter?.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  const query = `
    select * from app_circle_upgrades
    ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
    order by created_at desc
  `;

  const result = await db.query(query, params);
  return result.rows.map((row) => mapCircleRequest(row));
}

export async function getCircleUpgradeRequestById(id: string): Promise<CircleUpgradeRequestRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_circle_upgrades where id = $1 limit 1", [id]);
  if (result.rowCount === 0) return undefined;
  return mapCircleRequest(result.rows[0]);
}

export async function reviewCircleUpgradeRequest(input: {
  id: string;
  status: CircleUpgradeStatus;
  reviewedBy: string;
  reviewedAt: string;
  decisionNotes?: string;
}): Promise<CircleUpgradeRequestRecord | null> {
  const db = getPool();
  const result = await db.query(
    `
      update app_circle_upgrades
      set status = $2,
          reviewed_by = $3,
          reviewed_at = $4,
          decision_notes = $5
      where id = $1
      returning *
    `,
    [input.id, input.status, input.reviewedBy, input.reviewedAt, input.decisionNotes ?? null]
  );

  if (result.rowCount === 0) return null;

  const row = mapCircleRequest(result.rows[0]);
  await addAuditEvent({
    action: "circle.access.reviewed",
    targetType: "circle_upgrade",
    targetId: row.id,
    actor: input.reviewedBy,
    metadata: { status: row.status, circle: row.circle }
  });

  return row;
}

export async function applyReviewedUpgradeCallback(input: {
  requestId: string;
  status: CircleUpgradeStatus;
  reviewedAt: string;
  reviewedBy: string;
  reason?: string;
}): Promise<CircleUpgradeRequestRecord> {
  const existing = await getCircleUpgradeRequestById(input.requestId);
  if (!existing) {
    await saveCircleUpgradeRequest({
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

  const reviewed = await reviewCircleUpgradeRequest({
    id: input.requestId,
    status: input.status,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
    decisionNotes: input.reason
  });

  return reviewed ?? (await getCircleUpgradeRequestById(input.requestId))!;
}

export async function saveAiRequest(record: AiRequestRecord): Promise<AiRequestRecord> {
  const db = getPool();
  await db.query(
    `
      insert into app_ai_requests (
        id, user_id, prompt_type, prompt, status,
        response_summary, model, created_at, completed_at
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9
      )
      on conflict (id) do update
      set user_id = excluded.user_id,
          prompt_type = excluded.prompt_type,
          prompt = excluded.prompt,
          status = excluded.status,
          response_summary = excluded.response_summary,
          model = excluded.model,
          created_at = excluded.created_at,
          completed_at = excluded.completed_at
    `,
    [
      record.id,
      record.userId,
      record.promptType,
      record.prompt,
      record.status,
      record.responseSummary ?? null,
      record.model ?? null,
      record.createdAt,
      record.completedAt ?? null
    ]
  );

  await addAuditEvent({
    action: "ai.request.created",
    targetType: "ai_request",
    targetId: record.id,
    actor: record.userId,
    metadata: { promptType: record.promptType, status: record.status }
  });

  return record;
}

export async function listAiRequests(filter?: {
  userId?: string;
  status?: AiRequestRecord["status"];
}): Promise<AiRequestRecord[]> {
  const db = getPool();
  const where: string[] = [];
  const params: string[] = [];

  if (filter?.userId) {
    params.push(filter.userId);
    where.push(`user_id = $${params.length}`);
  }

  if (filter?.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  const query = `
    select * from app_ai_requests
    ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
    order by created_at desc
  `;

  const result = await db.query(query, params);
  return result.rows.map((row) => mapAiRequest(row));
}

export async function getAiRequestById(id: string): Promise<AiRequestRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_ai_requests where id = $1 limit 1", [id]);
  if (result.rowCount === 0) return undefined;
  return mapAiRequest(result.rows[0]);
}

export async function completeAiRequest(input: {
  id: string;
  responseSummary: string;
  model: string;
  completedAt: string;
}): Promise<AiRequestRecord | null> {
  const db = getPool();
  const result = await db.query(
    `
      update app_ai_requests
      set status = 'completed',
          response_summary = $2,
          model = $3,
          completed_at = $4
      where id = $1
      returning *
    `,
    [input.id, input.responseSummary, input.model, input.completedAt]
  );

  if (result.rowCount === 0) return null;

  const row = mapAiRequest(result.rows[0]);
  await addAuditEvent({
    action: "ai.request.completed",
    targetType: "ai_request",
    targetId: row.id,
    actor: "n8n-ai-worker",
    metadata: { model: input.model }
  });

  return row;
}

export async function saveMarketplaceListing(
  record: MarketplaceListingRecord
): Promise<MarketplaceListingRecord> {
  const db = getPool();
  await db.query(
    `
      insert into app_marketplace_listings (
        id, posted_by, title, type, category, summary,
        description, visibility, status, credits_cost, trust_requirement, created_at
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
    `,
    [
      record.id,
      record.postedBy,
      record.title,
      record.type,
      record.category,
      record.summary,
      record.description,
      record.visibility,
      record.status,
      record.creditsCost,
      record.trustRequirement,
      record.createdAt
    ]
  );

  await addAuditEvent({
    action: "marketplace.listing.created",
    targetType: "marketplace_listing",
    targetId: record.id,
    actor: record.postedBy,
    metadata: { type: record.type, status: record.status }
  });

  return record;
}

export async function listMarketplaceListings(filter?: {
  postedBy?: string;
  status?: MarketplaceListingRecord["status"];
}): Promise<MarketplaceListingRecord[]> {
  const db = getPool();
  const where: string[] = [];
  const params: string[] = [];

  if (filter?.postedBy) {
    params.push(filter.postedBy);
    where.push(`posted_by = $${params.length}`);
  }

  if (filter?.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  const query = `
    select l.*
    from app_marketplace_listings l
    left join app_users u on u.id = l.posted_by
    ${where.length > 0 ? `where ${where.map(w => `l.${w}`).join(" and ")}` : ""}
    order by coalesce(u.is_vip, false) desc, l.created_at desc
  `;

  const result = await db.query(query, params);
  return result.rows.map((row) => mapListing(row));
}

export async function getDirectChatThreadByUsers(input: {
  userA: string;
  userB: string;
}): Promise<ChatThreadRecord | undefined> {
  const db = getPool();
  const pair = normalizePair(input.userA, input.userB);
  const result = await db.query(
    `
      select *
      from app_chat_threads
      where kind = 'direct'
        and participant_a = $1
        and participant_b = $2
      limit 1
    `,
    [pair.participantA, pair.participantB]
  );
  if (result.rowCount === 0) return undefined;
  return mapChatThread(result.rows[0]);
}

export async function getChatThreadById(id: string): Promise<ChatThreadRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_chat_threads where id = $1 limit 1", [id]);
  if (result.rowCount === 0) return undefined;
  return mapChatThread(result.rows[0]);
}

export async function saveChatThread(record: ChatThreadRecord): Promise<ChatThreadRecord> {
  const db = getPool();
  const pair = normalizePair(record.participantA, record.participantB);
  const result = await db.query(
    `
      insert into app_chat_threads (
        id, kind, participant_a, participant_b, opened_by, status,
        created_at, updated_at, last_message_at, last_message_by, last_message_preview
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11
      )
      on conflict (participant_a, participant_b) do update
      set status = excluded.status,
          updated_at = excluded.updated_at,
          last_message_at = excluded.last_message_at,
          last_message_by = excluded.last_message_by,
          last_message_preview = excluded.last_message_preview
      returning *
    `,
    [
      record.id,
      record.kind,
      pair.participantA,
      pair.participantB,
      record.openedBy,
      record.status,
      record.createdAt,
      record.updatedAt,
      record.lastMessageAt ?? null,
      record.lastMessageBy ?? null,
      record.lastMessagePreview ?? null
    ]
  );

  const row = mapChatThread(result.rows[0]);

  await addAuditEvent({
    action: "chat.thread.opened",
    targetType: "chat_thread",
    targetId: row.id,
    actor: row.openedBy,
    metadata: {
      kind: row.kind,
      participantA: row.participantA,
      participantB: row.participantB
    }
  });

  return row;
}

export async function listChatThreadsByUser(userId: string): Promise<ChatThreadRecord[]> {
  const db = getPool();
  const result = await db.query(
    `
      select *
      from app_chat_threads
      where participant_a = $1 or participant_b = $1
      order by coalesce(last_message_at, updated_at) desc
    `,
    [userId]
  );
  return result.rows.map((row) => mapChatThread(row));
}

export async function saveChatMessage(record: ChatMessageRecord): Promise<ChatMessageRecord> {
  const db = getPool();
  const result = await db.query(
    `
      with inserted as (
        insert into app_chat_messages (id, thread_id, sender_user_id, content, created_at)
        values ($1, $2, $3, $4, $5)
        returning *
      ),
      touch as (
        update app_chat_threads
        set updated_at = $5,
            last_message_at = $5,
            last_message_by = $3,
            last_message_preview = left($4, 200)
        where id = $2
      )
      select * from inserted
    `,
    [record.id, record.threadId, record.senderUserId, record.content, record.createdAt]
  );

  const row = mapChatMessage(result.rows[0]);
  await addAuditEvent({
    action: "chat.message.sent",
    targetType: "chat_message",
    targetId: row.id,
    actor: row.senderUserId,
    metadata: {
      threadId: row.threadId
    }
  });
  return row;
}

export async function listChatMessages(input: {
  threadId: string;
  limit?: number;
}): Promise<ChatMessageRecord[]> {
  const db = getPool();
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.floor(input.limit!))) : 80;
  const result = await db.query(
    `
      select *
      from (
        select *
        from app_chat_messages
        where thread_id = $1
        order by created_at desc
        limit $2
      ) latest
      order by created_at asc
    `,
    [input.threadId, safeLimit]
  );
  return result.rows.map((row) => mapChatMessage(row));
}

export async function hasProcessedWebhookKey(key: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query(
    "select 1 from app_processed_keys where key_type = 'webhook' and key_value = $1 limit 1",
    [key]
  );
  return Number(result.rowCount ?? 0) > 0;
}

export async function markWebhookKeyProcessed(key: string): Promise<void> {
  const db = getPool();
  await db.query(
    "insert into app_processed_keys (key_type, key_value) values ('webhook', $1) on conflict do nothing",
    [key]
  );
}

export async function hasProcessedEventId(eventId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query(
    "select 1 from app_processed_keys where key_type = 'event' and key_value = $1 limit 1",
    [eventId]
  );
  return Number(result.rowCount ?? 0) > 0;
}

export async function markEventIdProcessed(eventId: string): Promise<void> {
  const db = getPool();
  await db.query(
    "insert into app_processed_keys (key_type, key_value) values ('event', $1) on conflict do nothing",
    [eventId]
  );
}

export async function addAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }
): Promise<AuditEvent> {
  const row: AuditEvent = {
    id: event.id ?? randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    actor: event.actor,
    metadata: event.metadata
  };

  const db = getPool();
  await db.query(
    `
      insert into app_audit_events (id, action, target_type, target_id, actor, metadata, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [row.id, row.action, row.targetType, row.targetId, row.actor, JSON.stringify(row.metadata), row.createdAt]
  );

  return row;
}

export async function listAuditEvents(limit = 200): Promise<AuditEvent[]> {
  const db = getPool();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.floor(limit))) : 200;
  const result = await db.query("select * from app_audit_events order by created_at desc limit $1", [safeLimit]);
  return result.rows.map((row) => mapAuditEvent(row));
}

export async function upsertUserAccount(input: UpsertUserInput): Promise<UserAccountRecord> {
  const db = getPool();
  const email = input.email.trim().toLowerCase();
  const result = await db.query(
    `
      insert into app_users (
        id, email, display_name, company_name, industry, role, access_level, verification_status, is_vip, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5,
        coalesce($6, 'applicant'),
        coalesce($7, 'explorer'),
        coalesce($8, 'none'),
        coalesce($9, false),
        $10, $11
      )
      on conflict (email) do update
      set display_name = coalesce(excluded.display_name, app_users.display_name),
          company_name = coalesce(excluded.company_name, app_users.company_name),
          industry = coalesce(excluded.industry, app_users.industry),
          role = case when $6 is null then app_users.role else excluded.role end,
          access_level = case when $7 is null then app_users.access_level else excluded.access_level end,
          verification_status = case when $8 is null then app_users.verification_status else excluded.verification_status end,
          is_vip = case when $9 is null then app_users.is_vip else excluded.is_vip end,
          updated_at = excluded.updated_at
      returning *
    `,
    [
      randomUUID(),
      email,
      input.displayName?.trim() || null,
      input.companyName?.trim() || null,
      input.industry?.trim() || null,
      input.role ?? null,
      input.accessLevel ?? null,
      input.verificationStatus ?? null,
      input.isVip ?? null,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  return mapUser(result.rows[0]);
}

export async function getUserByEmail(email: string): Promise<UserAccountRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_users where lower(email) = lower($1) limit 1", [email.trim()]);
  if (result.rowCount === 0) return undefined;
  return mapUser(result.rows[0]);
}

export async function getUserById(userId: string): Promise<UserAccountRecord | undefined> {
  const db = getPool();
  const result = await db.query("select * from app_users where id = $1 limit 1", [userId]);
  if (result.rowCount === 0) return undefined;
  return mapUser(result.rows[0]);
}

export async function listUsers(filter?: {
  role?: UserAccountRecord["role"];
  verificationStatus?: UserAccountRecord["verificationStatus"];
  query?: string;
  limit?: number;
}): Promise<
  Array<
    UserAccountRecord & {
      magicLinksTotal: number;
      magicLinksActive: number;
      lastMagicLinkAt?: string;
      lastMagicLinkUsedAt?: string;
      lastMagicLinkExpiresAt?: string;
    }
  >
> {
  const db = getPool();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filter?.role) {
    params.push(filter.role);
    where.push(`u.role = $${params.length}`);
  }
  if (filter?.verificationStatus) {
    params.push(filter.verificationStatus);
    where.push(`u.verification_status = $${params.length}`);
  }
  if (filter?.query?.trim()) {
    params.push(`%${filter.query.trim().toLowerCase()}%`);
    where.push(`(lower(u.email) like $${params.length} or lower(coalesce(u.display_name, '')) like $${params.length})`);
  }

  const safeLimit = Number.isFinite(filter?.limit) ? Math.max(1, Math.min(1000, Math.floor(filter!.limit!))) : 400;
  params.push(safeLimit);

  const query = `
    select
      u.*,
      coalesce(ml.total, 0) as magic_links_total,
      coalesce(ml.active, 0) as magic_links_active,
      ml.last_created_at,
      ml.last_used_at,
      ml.last_expires_at
    from app_users u
    left join lateral (
      select
        count(*)::int as total,
        count(*) filter (where used_at is null and expires_at > now())::int as active,
        max(created_at) as last_created_at,
        max(used_at) as last_used_at,
        max(expires_at) as last_expires_at
      from app_magic_links m
      where m.user_id = u.id
    ) ml on true
    ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
    order by u.created_at desc
    limit $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows.map((row) => ({
    ...mapUser(row),
    magicLinksTotal: Number(row.magic_links_total ?? 0),
    magicLinksActive: Number(row.magic_links_active ?? 0),
    lastMagicLinkAt: row.last_created_at ? toIso(row.last_created_at) : undefined,
    lastMagicLinkUsedAt: row.last_used_at ? toIso(row.last_used_at) : undefined,
    lastMagicLinkExpiresAt: row.last_expires_at ? toIso(row.last_expires_at) : undefined
  }));
}

export async function setUserVipStatus(userId: string, isVip: boolean): Promise<void> {
  const db = getPool();
  await db.query(
    "update app_users set is_vip = $2, updated_at = $3 where id = $1",
    [userId, isVip, new Date().toISOString()]
  );
}

export async function getUserVipStatus(userId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query("select is_vip from app_users where id = $1 limit 1", [userId]);
  return Boolean(result.rows[0]?.is_vip);
}

export async function issueActivityCredits(input: {
  userId: string;
  type: CreditTransactionType;
  amount: number;
  reason: string;
}): Promise<CreditTransaction> {
  const now = new Date().toISOString();
  // Idempotency: only one reward per type (except generic activity_reward)
  if (input.type !== "activity_reward") {
    const db = getPool();
    const existing = await db.query(
      "select 1 from app_credit_transactions where user_id = $1 and type = $2 limit 1",
      [input.userId, input.type]
    );
    if (Number(existing.rowCount) > 0) {
      return { id: randomUUID(), userId: input.userId, type: input.type, amount: 0, reason: "already_issued", createdAt: now };
    }
  }
  return addCreditTransaction({
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    createdAt: now
  });
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
  const db = getPool();
  const sets = ["updated_at = $2"];
  const params: Array<string | boolean | null> = [input.userId, new Date().toISOString()];

  if (typeof input.displayName === "string") {
    params.push(input.displayName.trim() || null);
    sets.push(`display_name = $${params.length}`);
  }
  if (typeof input.companyName === "string") {
    params.push(input.companyName.trim() || null);
    sets.push(`company_name = $${params.length}`);
  }
  if (typeof input.industry === "string") {
    params.push(input.industry.trim() || null);
    sets.push(`industry = $${params.length}`);
  }
  if (typeof input.avatarUrl === "string") {
    params.push(input.avatarUrl.trim() || null);
    sets.push(`avatar_url = $${params.length}`);
  }
  if (input.role) {
    params.push(input.role);
    sets.push(`role = $${params.length}`);
  }
  if (input.accessLevel) {
    params.push(input.accessLevel);
    sets.push(`access_level = $${params.length}`);
  }
  if (input.verificationStatus) {
    params.push(input.verificationStatus);
    sets.push(`verification_status = $${params.length}`);
  }
  if (typeof input.isVip === "boolean") {
    params.push(input.isVip);
    sets.push(`is_vip = $${params.length}`);
  }

  const result = await db.query(
    `
      update app_users
      set ${sets.join(", ")}
      where id = $1
      returning *
    `,
    params
  );

  if (result.rowCount === 0) return null;

  const row = mapUser(result.rows[0]);
  await addAuditEvent({
    action: "user.account.updated",
    targetType: "user",
    targetId: row.userId,
    actor: "admin",
    metadata: {
      role: row.role,
      accessLevel: row.accessLevel,
      verificationStatus: row.verificationStatus
    }
  });
  return row;
}

export async function deleteUserById(input: {
  userId: string;
  removedBy: string;
}): Promise<UserAccountRecord | null> {
  const db = getPool();
  const client = await db.connect();
  let removed: UserAccountRecord | null = null;

  try {
    await client.query("begin");
    const existing = await client.query("select * from app_users where id = $1 limit 1", [input.userId]);
    if (existing.rowCount === 0) {
      await client.query("rollback");
      return null;
    }

    removed = mapUser(existing.rows[0]);

    await client.query("delete from app_magic_links where user_id = $1", [input.userId]);
    await client.query("delete from app_sessions where user_id = $1", [input.userId]);
    await client.query("delete from app_credit_transactions where user_id = $1", [input.userId]);
    await client.query("delete from app_circle_upgrades where user_id = $1", [input.userId]);
    await client.query("delete from app_ai_requests where user_id = $1", [input.userId]);
    await client.query("delete from app_marketplace_listings where posted_by = $1", [input.userId]);
    await client.query("delete from app_chat_messages where sender_user_id = $1", [input.userId]);
    await client.query(
      `
        delete from app_chat_messages
        where thread_id in (
          select id from app_chat_threads
          where participant_a = $1 or participant_b = $1
        )
      `,
      [input.userId]
    );
    await client.query("delete from app_chat_threads where participant_a = $1 or participant_b = $1", [input.userId]);
    await client.query("delete from app_access_requests where lower(email) = lower($1)", [removed.email]);
    await client.query("delete from app_users where id = $1", [input.userId]);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (!removed) return null;

  await addAuditEvent({
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

export async function setUserRoleAndAccessByEmail(input: {
  email: string;
  role: UserAccountRecord["role"];
  accessLevel: AccessLevel;
  verificationStatus?: UserAccountRecord["verificationStatus"];
  website?: string;
  annualRevenue?: string;
}): Promise<UserAccountRecord | null> {
  const db = getPool();
  const result = await db.query(
    `
      update app_users
      set role = $2,
          access_level = $3,
          verification_status = coalesce($4, verification_status),
          website = coalesce($6, website),
          annual_revenue = coalesce($7, annual_revenue),
          updated_at = $5
      where lower(email) = lower($1)
      returning *
    `,
    [input.email.trim(), input.role, input.accessLevel, input.verificationStatus ?? null, new Date().toISOString(), input.website ?? null, input.annualRevenue ?? null]
  );

  if (result.rowCount === 0) return null;
  return mapUser(result.rows[0]);
}

export async function createMagicLink(input: {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  requestedIp?: string;
  requestedUserAgent?: string;
}): Promise<void> {
  const db = getPool();
  await db.query(
    `
      insert into app_magic_links (
        id, user_id, email, token_hash, expires_at, used_at, created_at, requested_ip, requested_user_agent
      ) values (
        $1, $2, $3, $4, $5, null, $6, $7, $8
      )
    `,
    [
      randomUUID(),
      input.userId,
      input.email.trim().toLowerCase(),
      input.tokenHash,
      input.expiresAt,
      input.createdAt,
      input.requestedIp ?? null,
      input.requestedUserAgent ?? null
    ]
  );
}

export async function consumeMagicLink(tokenHash: string, consumedAt: string): Promise<UserAccountRecord | null> {
  const db = getPool();
  const result = await db.query(
    `
      with claimed as (
        update app_magic_links
        set used_at = $2
        where token_hash = $1
          and used_at is null
          and expires_at > $2::timestamptz
        returning user_id
      )
      select u.*
      from app_users u
      inner join claimed c on c.user_id = u.id
      limit 1
    `,
    [tokenHash, consumedAt]
  );

  if (result.rowCount === 0) return null;
  return mapUser(result.rows[0]);
}

export async function listMagicLinksByUserId(input: {
  userId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    userId: string;
    email: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
    usedAt?: string;
    requestedIp?: string;
    requestedUserAgent?: string;
  }>
> {
  const db = getPool();
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(300, Math.floor(input.limit!))) : 50;
  const result = await db.query(
    `
      select id, user_id, email, token_hash, created_at, expires_at, used_at, requested_ip, requested_user_agent
      from app_magic_links
      where user_id = $1
      order by created_at desc
      limit $2
    `,
    [input.userId, safeLimit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    email: String(row.email ?? ""),
    tokenHash: String(row.token_hash ?? ""),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    usedAt: row.used_at ? toIso(row.used_at) : undefined,
    requestedIp: row.requested_ip ? String(row.requested_ip) : undefined,
    requestedUserAgent: row.requested_user_agent ? String(row.requested_user_agent) : undefined
  }));
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const db = getPool();
  await db.query(
    `
      insert into app_sessions (
        id, user_id, token_hash, expires_at, revoked_at, created_at, last_seen_at, ip, user_agent
      ) values (
        $1, $2, $3, $4, null, $5, $5, $6, $7
      )
    `,
    [randomUUID(), input.userId, input.tokenHash, input.expiresAt, input.createdAt, input.ip ?? null, input.userAgent ?? null]
  );
}

export async function getSessionByToken(token: string): Promise<SessionUserRecord | null> {
  const db = getPool();
  const hashed = shaToken(token);
  const now = new Date().toISOString();
  const result = await db.query(
    `
      select u.*
      from app_sessions s
      inner join app_users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > $2::timestamptz
      limit 1
    `,
    [hashed, now]
  );

  if (result.rowCount === 0) return null;

  await db.query("update app_sessions set last_seen_at = $2 where token_hash = $1", [hashed, now]);

  const user = mapUser(result.rows[0]);
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    companyName: user.companyName,
    role: user.role,
    accessLevel: user.accessLevel,
    verificationStatus: user.verificationStatus,
    isVip: user.isVip ?? false,
    isElite: user.isElite ?? false,
    industry: user.industry,
    avatarUrl: user.avatarUrl
  };
}

export async function revokeSessionByToken(token: string, revokedAt: string): Promise<void> {
  const db = getPool();
  await db.query(
    `
      update app_sessions
      set revoked_at = $2
      where token_hash = $1
        and revoked_at is null
    `,
    [shaToken(token), revokedAt]
  );
}

export async function getNetworkGraph(input: {
  userId: string;
  limit?: number;
}): Promise<{ nodes: NetworkGraphNode[]; edges: NetworkGraphEdge[] }> {
  const db = getPool();
  const safeLimit = Number.isFinite(input.limit) ? Math.max(6, Math.min(80, Math.floor(input.limit!))) : 28;

  const nodeResult = await db.query(
    `
      with me as (
        select
          concat('user:', u.id) as id,
          'user'::text as type,
          coalesce(nullif(u.company_name, ''), nullif(u.display_name, ''), split_part(u.email, '@', 1)) as label,
          coalesce(nullif(u.company_name, ''), nullif(u.display_name, ''), split_part(u.email, '@', 1)) as company,
          'Your business at the centre of the network'::text as summary,
          u.signal_score::int as heat,
          50::float8 as x,
          50::float8 as y,
          u.access_level::text as status,
          u.id::text as target_user_id,
          u.email::text as target_email,
          u.verification_status::text as verification,
          u.trust_score::int as trust_score,
          u.is_vip as is_vip,
          u.industry::text as industry,
          u.avatar_url::text as avatar_url,
          u.website::text as website,
          u.annual_revenue::text as annual_revenue,
          0::int as ord
        from app_users u
        where u.id = $1
      ),
      member_nodes as (
        select
          concat('member:', m.id) as id,
          'user'::text as type,
          coalesce(nullif(m.company_name, ''), nullif(m.display_name, ''), split_part(m.email, '@', 1)) as label,
          coalesce(nullif(m.company_name, ''), nullif(m.display_name, ''), split_part(m.email, '@', 1)) as company,
          concat(
            case when m.is_vip then 'VIP Member' else 'Verified Member' end,
            ' · ',
            replace(m.access_level::text, '_', ' ')
          )::text as summary,
          m.signal_score::int as heat,
          (8 + ((row_number() over (order by m.updated_at desc) - 1) % 6) * 14)::float8 as x,
          (10 + floor((row_number() over (order by m.updated_at desc) - 1) / 6) * 14)::float8 as y,
          m.access_level::text as status,
          m.id::text as target_user_id,
          m.email::text as target_email,
          m.verification_status::text as verification,
          m.trust_score::int as trust_score,
          m.is_vip as is_vip,
          m.industry::text as industry,
          m.avatar_url::text as avatar_url,
          m.website::text as website,
          m.annual_revenue::text as annual_revenue,
          (8 + row_number() over (order by m.updated_at desc))::int as ord
        from app_users m
        where m.id <> $1
          and m.verification_status = 'verified'
          and m.role in ('member', 'verified_member', 'premium_member', 'circle_member', 'moderator', 'admin', 'super_admin')
        order by m.updated_at desc
        limit ($2 - 1)
      ),
      all_nodes as (
        select * from me
        union all
        select * from member_nodes
      )
      select id, type, label, company, summary, heat, x, y, status, target_user_id, target_email, verification, trust_score, is_vip, industry, avatar_url, website, annual_revenue
      from all_nodes
      order by ord
      limit $2
    `,
    [input.userId, safeLimit]
  );

  const nodes = nodeResult.rows.map((row): NetworkGraphNode => ({
    id: String(row.id),
    type: String(row.type) as NetworkGraphNode["type"],
    label: String(row.label ?? ""),
    company: row.company ? String(row.company) : undefined,
    industry: row.industry ? String(row.industry) : undefined,
    summary: String(row.summary ?? ""),
    heat: Number(row.heat ?? 0),
    x: Number(row.x ?? 50),
    y: Number(row.y ?? 50),
    status: row.status ? String(row.status) : undefined,
    targetUserId: row.target_user_id ? String(row.target_user_id) : undefined,
    targetEmail: row.target_email ? String(row.target_email) : undefined,
    verification: row.verification ? String(row.verification) as NetworkGraphNode["verification"] : undefined,
    trustScore: row.trust_score != null ? Number(row.trust_score) : undefined,
    isVip: Boolean(row.is_vip),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    website: row.website ? String(row.website) : undefined,
    annualRevenue: row.annual_revenue ? String(row.annual_revenue) : undefined,
  }));

  const centerNodeId = `user:${input.userId}`;
  const edges: NetworkGraphEdge[] = nodes
    .filter((node) => node.id !== centerNodeId)
    .map((node, index) => ({
      id: `edge:${input.userId}:${index}:${node.id}`,
      source: centerNodeId,
      target: node.id,
      relation:
        node.type === "user"
          ? "core"
          : node.type === "listing"
            ? "opportunity"
            : node.type === "ai"
              ? "insight"
              : "access",
      strength: Math.max(35, Math.min(100, node.heat))
    }));

  return { nodes, edges };
}

export async function savePitch(pitch: {
  id: string; senderId: string; recipientId: string;
  title: string; summary: string; deckUrl?: string; ask: string;
  creditsCharged: number; createdAt: string;
}): Promise<{ id: string; senderId: string; recipientId: string; title: string; summary: string; deckUrl?: string; ask: string; status: string; creditsCharged: number; createdAt: string; updatedAt: string; }> {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO pitches (id, sender_id, recipient_id, title, summary, deck_url, ask, status, credits_charged, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$9)
     RETURNING *`,
    [pitch.id, pitch.senderId, pitch.recipientId, pitch.title, pitch.summary, pitch.deckUrl ?? null, pitch.ask, pitch.creditsCharged, pitch.createdAt]
  );
  const row = result.rows[0];
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, title: row.title, summary: row.summary, deckUrl: row.deck_url ?? undefined, ask: row.ask, status: row.status, creditsCharged: row.credits_charged, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

export async function listPitchesByRecipient(recipientId: string): Promise<Array<{ id: string; senderId: string; senderName?: string; senderCompany?: string; title: string; summary: string; ask: string; status: string; creditsCharged: number; createdAt: string; }>> {
  const db = getPool();
  const result = await db.query(
    `SELECT p.*, u.display_name as sender_name, u.company_name as sender_company
     FROM pitches p
     LEFT JOIN app_users u ON u.id = p.sender_id
     WHERE p.recipient_id = $1
     ORDER BY p.created_at DESC`,
    [recipientId]
  );
  return result.rows.map(r => ({ id: r.id, senderId: r.sender_id, senderName: r.sender_name ?? undefined, senderCompany: r.sender_company ?? undefined, title: r.title, summary: r.summary, ask: r.ask, status: r.status, creditsCharged: r.credits_charged, createdAt: toIso(r.created_at) }));
}

export async function getPitchById(id: string): Promise<{ id: string; senderId: string; recipientId: string; status: string } | undefined> {
  const db = getPool();
  const result = await db.query(`SELECT id, sender_id, recipient_id, status FROM pitches WHERE id=$1`, [id]);
  if (!result.rows[0]) return undefined;
  const r = result.rows[0];
  return { id: r.id, senderId: r.sender_id, recipientId: r.recipient_id, status: r.status };
}

export async function updatePitchStatus(id: string, status: 'accepted' | 'declined'): Promise<void> {
  const db = getPool();
  await db.query(`UPDATE pitches SET status=$1, updated_at=NOW() WHERE id=$2`, [status, id]);
}

export async function countPendingPitches(recipientId: string): Promise<number> {
  const db = getPool();
  const result = await db.query(`SELECT COUNT(*)::int as count FROM pitches WHERE recipient_id=$1 AND status='pending'`, [recipientId]);
  return result.rows[0]?.count ?? 0;
}

// Increment signal score by delta, capped at 100
export async function incrementSignalScore(userId: string, delta: number): Promise<void> {
  const db = getPool();
  await db.query(
    `update app_users
     set signal_score = least(100, signal_score + $2), updated_at = $3
     where id = $1`,
    [userId, delta, new Date().toISOString()]
  );
}

// Recalculate trust score from profile completeness + verification status
export async function recalculateTrustScore(userId: string): Promise<number> {
  const db = getPool();
  const res = await db.query(
    "select display_name, company_name, avatar_url, verification_status, trust_score from app_users where id = $1",
    [userId]
  );
  if (res.rowCount === 0) return 20;

  const row = res.rows[0];
  let score = 20; // base
  if (row.display_name) score += 5;
  if (row.company_name) score += 5;
  if (row.avatar_url) score += 3;
  if (row.verification_status === "verified") score += 12;
  else if (row.verification_status === "pending") score += 4;

  // Add accumulated bonus (stored separately — we keep it as a bonus on top)
  // Get current trust_score, keep any earned bonus above the base
  const currentScore = Number(row.trust_score ?? 20);
  const baseCalculated = score;
  // Keep whichever is higher (so earned bonuses persist)
  const finalScore = Math.min(100, Math.max(baseCalculated, currentScore));

  await db.query(
    "update app_users set trust_score = $2, updated_at = $3 where id = $1",
    [userId, finalScore, new Date().toISOString()]
  );
  return finalScore;
}

// Add trust bonus (for events like accepted intro, accepted pitch)
export async function addTrustBonus(userId: string, bonus: number): Promise<void> {
  const db = getPool();
  await db.query(
    `update app_users
     set trust_score = least(100, trust_score + $2), updated_at = $3
     where id = $1`,
    [userId, bonus, new Date().toISOString()]
  );
}

// Record a profile view for a VIP user and return new count (for milestone credit checks)
export async function recordProfileView(viewedUserId: string): Promise<number> {
  const db = getPool();
  const result = await db.query(
    `update app_users
     set profile_view_count = profile_view_count + 1
     where id = $1
     returning profile_view_count, is_vip`,
    [viewedUserId]
  );
  if (result.rowCount === 0) return 0;
  return Number(result.rows[0].profile_view_count ?? 0);
}

export async function getProfileViewCount(userId: string): Promise<number> {
  const db = getPool();
  const result = await db.query(
    "select profile_view_count from app_users where id = $1",
    [userId]
  );
  return Number(result.rows[0]?.profile_view_count ?? 0);
}

function mapEvent(row: Record<string, unknown>): EventRecord {
  return {
    id: String(row.id),
    postedBy: String(row.posted_by),
    postedByName: row.posted_by_name ? String(row.posted_by_name) : undefined,
    postedByAvatarUrl: row.posted_by_avatar_url ? String(row.posted_by_avatar_url) : undefined,
    title: String(row.title),
    topic: String(row.topic ?? "other") as EventRecord["topic"],
    description: String(row.description ?? ""),
    location: String(row.location ?? ""),
    address: row.address ? String(row.address) : undefined,
    link: row.link ? String(row.link) : undefined,
    dateTime: toIso(row.date_time),
    endTime: row.end_time ? toIso(row.end_time) : undefined,
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "EUR"),
    maxAttendees: row.max_attendees != null ? Number(row.max_attendees) : undefined,
    status: String(row.status ?? "published") as EventRecord["status"],
    rsvpCount: row.rsvp_count != null ? Number(row.rsvp_count) : 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function saveEvent(record: EventRecord): Promise<EventRecord> {
  const db = getPool();
  const now = new Date().toISOString();
  await db.query(
    `insert into app_events (id, posted_by, title, topic, description, location, address, link, date_time, end_time, price, currency, max_attendees, status, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (id) do update set title=$3, topic=$4, description=$5, location=$6, address=$7, link=$8, date_time=$9, end_time=$10, price=$11, currency=$12, max_attendees=$13, status=$14, updated_at=$16`,
    [
      record.id, record.postedBy, record.title, record.topic, record.description,
      record.location, record.address ?? null, record.link ?? null,
      record.dateTime, record.endTime ?? null,
      record.price, record.currency, record.maxAttendees ?? null, record.status,
      record.createdAt, now
    ]
  );
  const res = await db.query(
    `select e.*, u.display_name as posted_by_name, u.avatar_url as posted_by_avatar_url,
     (select count(*) from app_event_rsvps r where r.event_id = e.id)::int as rsvp_count
     from app_events e left join app_users u on u.id = e.posted_by where e.id = $1`, [record.id]
  );
  return mapEvent(res.rows[0]);
}

export async function listEvents(filter?: { status?: string; postedBy?: string }): Promise<EventRecord[]> {
  const db = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.status) { params.push(filter.status); conditions.push(`e.status = $${params.length}`); }
  if (filter?.postedBy) { params.push(filter.postedBy); conditions.push(`e.posted_by = $${params.length}`); }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const res = await db.query(
    `select e.*, u.display_name as posted_by_name, u.avatar_url as posted_by_avatar_url,
     (select count(*) from app_event_rsvps r where r.event_id = e.id)::int as rsvp_count
     from app_events e left join app_users u on u.id = e.posted_by ${where} order by e.date_time asc`,
    params
  );
  return res.rows.map(mapEvent);
}

export async function getEventById(id: string): Promise<(EventRecord & { attendees: EventAttendee[] }) | undefined> {
  const db = getPool();
  const res = await db.query(
    `select e.*, u.display_name as posted_by_name, u.avatar_url as posted_by_avatar_url,
     (select count(*) from app_event_rsvps r where r.event_id = e.id)::int as rsvp_count
     from app_events e left join app_users u on u.id = e.posted_by where e.id = $1`, [id]
  );
  if (res.rowCount === 0) return undefined;
  const event = mapEvent(res.rows[0]);

  const rsvps = await db.query(
    `select r.user_id, r.created_at, u.display_name, u.company_name, u.avatar_url
     from app_event_rsvps r left join app_users u on u.id = r.user_id
     where r.event_id = $1 order by r.created_at asc`, [id]
  );
  const attendees: EventAttendee[] = rsvps.rows.map(r => ({
    userId: String(r.user_id),
    displayName: r.display_name ? String(r.display_name) : undefined,
    companyName: r.company_name ? String(r.company_name) : undefined,
    avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
    joinedAt: toIso(r.created_at),
  }));
  return { ...event, attendees };
}

export async function cancelEvent(id: string, userId: string): Promise<EventRecord | null> {
  const db = getPool();
  const res = await db.query(
    `update app_events set status = 'cancelled', updated_at = $3 where id = $1 and posted_by = $2 returning *`,
    [id, userId, new Date().toISOString()]
  );
  if (res.rowCount === 0) return null;
  return mapEvent(res.rows[0]);
}

export async function rsvpEvent(eventId: string, userId: string, rsvpId: string): Promise<void> {
  const db = getPool();
  await db.query(
    `insert into app_event_rsvps (id, event_id, user_id, created_at) values ($1,$2,$3,$4) on conflict (event_id, user_id) do nothing`,
    [rsvpId, eventId, userId, new Date().toISOString()]
  );
}

export async function cancelRsvp(eventId: string, userId: string): Promise<void> {
  const db = getPool();
  await db.query(`delete from app_event_rsvps where event_id = $1 and user_id = $2`, [eventId, userId]);
}

export async function getUserRsvp(eventId: string, userId: string): Promise<boolean> {
  const db = getPool();
  const res = await db.query(`select 1 from app_event_rsvps where event_id = $1 and user_id = $2`, [eventId, userId]);
  return (res.rowCount ?? 0) > 0;
}

export async function getUsersByIndustry(industry: string): Promise<Array<{ companyName?: string; displayName?: string; industry?: string }>> {
  const db = getPool();
  const res = await db.query(
    `select display_name, company_name, industry from app_users
     where lower(industry) = lower($1) and role != 'applicant' and role != 'public_visitor'
     order by display_name asc limit 50`,
    [industry]
  );
  return res.rows.map(r => ({
    displayName: r.display_name ? String(r.display_name) : undefined,
    companyName: r.company_name ? String(r.company_name) : undefined,
    industry: r.industry ? String(r.industry) : undefined,
  }));
}

// ── Referrals ──────────────────────────────────────────────────

function generateReferralCode(userId: string): string {
  const base = userId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${rand}`;
}

export async function getOrCreateReferralCode(userId: string, isVip: boolean): Promise<{ code: string; uses: number }> {
  const db = getPool();
  const existing = await db.query(`select code, uses from app_referrals where user_id = $1`, [userId]);
  if (existing.rowCount && existing.rowCount > 0) {
    return { code: String(existing.rows[0].code), uses: Number(existing.rows[0].uses) };
  }
  const code = generateReferralCode(userId);
  await db.query(
    `insert into app_referrals (code, user_id, is_vip, uses, created_at) values ($1,$2,$3,0,now())
     on conflict (user_id) do nothing`,
    [code, userId, isVip]
  );
  const created = await db.query(`select code, uses from app_referrals where user_id = $1`, [userId]);
  return { code: String(created.rows[0].code), uses: Number(created.rows[0].uses) };
}

export async function applyReferralCode(code: string, newUserId: string): Promise<{ referrerId: string; referrerReward: number; newUserReward: number } | null> {
  const db = getPool();
  // Check if already used a referral code
  const alreadyUsed = await db.query(`select 1 from app_referral_uses where used_by = $1`, [newUserId]);
  if (alreadyUsed.rowCount && alreadyUsed.rowCount > 0) return null;

  const ref = await db.query(`select user_id, is_vip from app_referrals where upper(code) = upper($1)`, [code]);
  if (!ref.rowCount || ref.rowCount === 0) return null;
  const referrerId = String(ref.rows[0].user_id);
  if (referrerId === newUserId) return null;

  const isVip = Boolean(ref.rows[0].is_vip);
  const referrerReward = isVip ? 40 : 20;
  const newUserReward = 10;
  const now = new Date().toISOString();

  await db.query(`update app_referrals set uses = uses + 1 where upper(code) = upper($1)`, [code]);
  await db.query(
    `insert into app_referral_uses (id, code, used_by, credited_amount, created_at) values ($1,$2,$3,$4,$5)`,
    [randomUUID(), code, newUserId, referrerReward, now]
  );
  return { referrerId, referrerReward, newUserReward };
}

// ── Elite Circle ───────────────────────────────────────────────

export async function setUserEliteStatus(userId: string, isElite: boolean): Promise<void> {
  const db = getPool();
  await db.query(`update app_users set is_elite = $2, updated_at = now() where id = $1`, [userId, isElite]);
}

export async function getUserEliteStatus(userId: string): Promise<boolean> {
  const db = getPool();
  const res = await db.query(`select is_elite from app_users where id = $1`, [userId]);
  return Boolean(res.rows[0]?.is_elite);
}

export async function listEliteMembers(): Promise<UserAccountRecord[]> {
  const db = getPool();
  const res = await db.query(
    `select * from app_users where is_elite = true order by display_name asc`
  );
  return res.rows.map(mapUser);
}

export async function saveEliteMessage(msg: { id: string; userId: string; displayName?: string; avatarUrl?: string; content: string }): Promise<void> {
  const db = getPool();
  await db.query(
    `insert into app_elite_messages (id, user_id, display_name, avatar_url, content, created_at)
     values ($1,$2,$3,$4,$5,now())`,
    [msg.id, msg.userId, msg.displayName ?? null, msg.avatarUrl ?? null, msg.content]
  );
}

export async function listEliteMessages(limit = 100): Promise<Array<{ id: string; userId: string; displayName?: string; avatarUrl?: string; content: string; createdAt: string }>> {
  const db = getPool();
  const res = await db.query(
    `select id, user_id, display_name, avatar_url, content, created_at from app_elite_messages order by created_at asc limit $1`,
    [limit]
  );
  return res.rows.map(r => ({
    id: String(r.id),
    userId: String(r.user_id),
    displayName: r.display_name ? String(r.display_name) : undefined,
    avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
    content: String(r.content),
    createdAt: toIso(r.created_at),
  }));
}

export async function deleteEliteMessagesBefore(cutoffIso: string): Promise<void> {
  const db = getPool();
  await db.query(`delete from app_elite_messages where created_at < $1::timestamptz`, [cutoffIso]);
}
