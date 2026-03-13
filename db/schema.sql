create extension if not exists "pgcrypto";

create type member_role as enum (
  'public_visitor',
  'applicant',
  'member',
  'verified_member',
  'premium_member',
  'circle_member',
  'moderator',
  'admin',
  'super_admin'
);

create type access_level as enum (
  'explorer',
  'curated',
  'verified',
  'insider',
  'private_circle_eligible'
);

create type verification_status as enum (
  'none',
  'pending',
  'verified',
  'rejected'
);

create type application_status as enum (
  'under_review',
  'waitlisted',
  'accepted',
  'rejected'
);

create type credit_source as enum (
  'free',
  'earned',
  'purchased',
  'promotional'
);

create type credit_tx_type as enum (
  'welcome_bonus',
  'profile_completion',
  'verification_bonus',
  'contribution_reward',
  'invite_reward',
  'spend_unlock',
  'spend_ai',
  'purchase',
  'refund'
);

create type listing_type as enum (
  'opportunity',
  'request',
  'offer',
  'collaboration',
  'premium_access',
  'event_seat',
  'strategic_need',
  'private_deal'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role member_role not null default 'applicant',
  access_level access_level not null default 'explorer',
  verification_status verification_status not null default 'none',
  trust_score numeric(5,2) not null default 0,
  contribution_score numeric(5,2) not null default 0,
  connector_score numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  display_name text not null,
  headline text,
  short_bio text,
  long_bio text,
  tags text[] not null default '{}',
  location text,
  business_type text,
  offer_text text,
  seek_text text,
  avatar_url text,
  website_url text,
  linkedin_url text,
  instagram_url text,
  profile_visibility text not null default 'members',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  category text not null,
  location text,
  website text,
  linkedin text,
  instagram text,
  what_offer text not null,
  what_seek text not null,
  why_join text not null,
  status application_status not null default 'under_review',
  ai_score numeric(5,2) not null default 0,
  human_score numeric(5,2),
  access_level_recommended access_level not null default 'explorer',
  admin_notes text,
  invite_code text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table credit_wallet (
  user_id uuid primary key references users(id) on delete cascade,
  balance integer not null default 0,
  earned_balance integer not null default 0,
  purchased_balance integer not null default 0,
  promotional_balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  transaction_type credit_tx_type not null,
  source credit_source not null,
  amount integer not null,
  reason text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_transactions_user_created_idx on credit_transactions(user_id, created_at desc);

create table circles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  visibility text not null default 'hidden',
  minimum_access_level access_level not null default 'verified',
  created_at timestamptz not null default now()
);

create table circle_memberships (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  unique(circle_id, user_id)
);

create table nodes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  title text not null,
  summary text,
  location text,
  visibility text not null default 'members',
  unlock_cost integer not null default 0,
  trust_requirement numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create table edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references nodes(id) on delete cascade,
  target_node_id uuid not null references nodes(id) on delete cascade,
  edge_type text not null,
  edge_strength numeric(5,2) not null default 0,
  reason text,
  ai_score numeric(5,2),
  is_visible boolean not null default true,
  unlock_cost integer not null default 0,
  created_at timestamptz not null default now(),
  unique(source_node_id, target_node_id, edge_type)
);

create index edges_source_idx on edges(source_node_id);
create index edges_target_idx on edges(target_node_id);

create table marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid not null references users(id) on delete cascade,
  listing_type listing_type not null,
  category text not null,
  title text not null,
  summary text not null,
  description text not null,
  price_type text,
  visibility text not null default 'members',
  status text not null default 'active',
  featured boolean not null default false,
  credits_cost integer not null default 0,
  trust_requirement numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table forum_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table forum_posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references forum_rooms(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  topic text,
  content text not null,
  ai_summary text,
  quality_score numeric(5,2),
  reward_credits integer not null default 0,
  moderation_status text not null default 'approved',
  created_at timestamptz not null default now()
);

create table intro_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  target_user_id uuid not null references users(id) on delete cascade,
  message text,
  status text not null default 'pending',
  credits_spent integer not null default 0,
  created_at timestamptz not null default now()
);

create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  prompt_type text not null,
  prompt text not null,
  response_summary text,
  model text,
  status text not null default 'queued',
  credits_used integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  channel text not null default 'in_app',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  score_delta numeric(5,2) not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
