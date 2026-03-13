"use client";

import { MarketplaceListingTypes } from "@mallorca/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getJson, getSessionToken, postJson } from "../lib/api";

type AuthUser = { userId: string; email: string; displayName?: string; };
type Listing = {
  id: string; postedBy?: string; title: string; type: string; category: string;
  summary: string; description: string; visibility: "members" | "circle" | "private";
  status: "active" | "paused" | "closed"; creditsCost: number;
  trustRequirement: number; createdAt: string;
};
type ApiList<T> = { items: T[]; };

const listingTypes = [...MarketplaceListingTypes];
const PUBLISH_FEE = 10;
const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

const typeLabel: Record<string, { label: string; color: string; bg: string }> = {
  opportunity:    { label: "Opportunity",     color: "#C4973A", bg: "rgba(196,151,58,0.10)" },
  request:        { label: "Request",         color: "#8A9DB8", bg: "rgba(138,157,184,0.10)" },
  offer:          { label: "Offer",           color: "#B8C4A8", bg: "rgba(184,196,168,0.10)" },
  collaboration:  { label: "Collaboration",   color: "#C4A87A", bg: "rgba(196,168,122,0.10)" },
  premium_access: { label: "Premium Access",  color: "#D4A84A", bg: "rgba(212,168,74,0.12)" },
  event_seat:     { label: "Event",           color: "#9A8FC4", bg: "rgba(154,143,196,0.10)" },
  strategic_need: { label: "Strategic Need",  color: "#C4973A", bg: "rgba(196,151,58,0.08)" },
  private_deal:   { label: "Private Deal",    color: "#E8D5A8", bg: "rgba(232,213,168,0.10)" },
};

function titleCase(v: string): string {
  return v.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isoDate(v: string): string {
  try { return fmtDate.format(new Date(v)); } catch { return v; }
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message.trim();
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as { message?: string; error?: string; required?: number; balance?: number };
    if (p.error === "missing_session_token" || p.error === "invalid_session") return "Sign in from Workspace first.";
    if (p.error === "invalid_payload") return "Please check your inputs and try again.";
    if (p.error === "insufficient_credits") {
      const req = typeof p.required === "number" ? p.required : PUBLISH_FEE;
      const bal = typeof p.balance === "number" ? p.balance : 0;
      return `Insufficient credits. Required: ${req}, available: ${bal}. Visit Credits to top up.`;
    }
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  return raw.slice(0, 220);
}

export function MarketplaceHub() {
  const [me, setMe]                 = useState<AuthUser | null>(null);
  const [loading, setLoading]       = useState(true);
  const [errorLine, setErrorLine]   = useState<string | null>(null);
  const [feed, setFeed]             = useState<Listing[]>([]);
  const [mine, setMine]             = useState<Listing[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<"all" | string>("all");
  const [publishOpen, setPublishOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [listingTitle, setListingTitle]             = useState("");
  const [listingType, setListingType]               = useState(listingTypes[0] ?? "opportunity");
  const [listingCategory, setListingCategory]       = useState("");
  const [listingSummary, setListingSummary]         = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [visibility, setVisibility]                 = useState<"members" | "circle" | "private">("members");
  const [creditsCost, setCreditsCost]               = useState(0);
  const [trustRequirement, setTrustRequirement]     = useState(20);

  async function refresh(): Promise<void> {
    if (!getSessionToken()) {
      setMe(null); setFeed([]); setMine([]); setLoading(false);
      return;
    }
    setLoading(true); setErrorLine(null);
    try {
      const meRes = await getJson<{ user: AuthUser }>("/v1/auth/me", { auth: true });
      setMe(meRes.user);
      try {
        const [marketRes, mineRes] = await Promise.all([
          getJson<ApiList<Listing>>("/v1/marketplace/listings?mine=false", { auth: true }),
          getJson<ApiList<Listing>>("/v1/marketplace/listings", { auth: true }),
        ]);
        setFeed(marketRes.items ?? []);
        setMine(mineRes.items ?? []);
      } catch (dataError) {
        setFeed([]); setMine([]);
        setErrorLine(friendlyError(dataError, "Could not load listings. Try refreshing."));
      }
    } catch (authError) {
      setMe(null); setFeed([]); setMine([]);
      setErrorLine(friendlyError(authError, "Authentication failed. Please sign in from Workspace."));
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const filteredFeed = useMemo(() => {
    return [...feed]
      .filter(item => filterType === "all" || item.type === filterType)
      .filter(item => item.status === "active")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [feed, filterType]);

  async function publishListing(): Promise<void> {
    if (!listingTitle.trim() || !listingSummary.trim() || !listingDescription.trim()) {
      setErrorLine("Please complete the title, summary, and description."); return;
    }
    setSubmitting(true); setErrorLine(null);
    try {
      await postJson<{ id: string; status: string; chargedCredits: number; balance: number }>(
        "/v1/marketplace/listings",
        {
          title: listingTitle.trim(), type: listingType,
          category: listingCategory.trim() || "general",
          summary: listingSummary.trim(), description: listingDescription.trim(),
          visibility, creditsCost, trustRequirement,
        },
        { auth: true }
      );
      setListingTitle(""); setListingSummary(""); setListingDescription("");
      setListingCategory(""); setCreditsCost(0); setTrustRequirement(20);
      setPublishOpen(false);
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not publish listing."));
    } finally { setSubmitting(false); }
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 text-center">
        <p className="text-sm" style={{ color: G.muted }}>Loading marketplace…</p>
      </section>
    );
  }

  /* ── Not signed in ─────────────────────────────────────────── */
  if (!me) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 sm:p-12">
        <p className="text-[10px] uppercase tracking-[0.40em]" style={{ color: G.gold }}>
          Private Marketplace
        </p>
        <h1
          className="mt-4 max-w-2xl"
          style={{ fontFamily: G.display, fontSize: "clamp(2.4rem,5vw,3.8rem)", color: G.champagne, lineHeight: 1.0 }}
        >
          Off-market.<br />By invitation only.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed" style={{ color: G.muted }}>
          Strategic partnerships, private deals, and exclusive opportunities — shared between members who already trust each other. No public listings. No unsolicited outreach.
        </p>
        <div className="mt-7 flex gap-3">
          <Link href="/workspace" className="btn-primary premium-button rounded-xl px-7 py-3 text-sm">
            Sign In to Enter
          </Link>
          <Link href="/request-access" className="btn-quiet rounded-xl px-6 py-3 text-sm">
            Request Access
          </Link>
        </div>
      </section>
    );
  }

  /* ── Main ─────────────────────────────────────────────────── */
  return (
    <div className="grid gap-5">

      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.40em]" style={{ color: G.gold }}>
              Private Marketplace
            </p>
            <h1
              className="mt-3"
              style={{
                fontFamily: G.display,
                fontSize: "clamp(2rem,4vw,3rem)",
                color: G.champagne,
                lineHeight: 1.0,
                letterSpacing: "-0.01em",
              }}
            >
              Curated opportunities<br />
              <span className="text-gradient-gold">for the circle.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: G.muted }}>
              Off-market deals, strategic partnerships, and private access — shared between verified members. Every listing is deliberate. Every contact costs credits.
            </p>
          </div>
          <button
            onClick={() => setPublishOpen(o => !o)}
            className="btn-primary premium-button shrink-0 rounded-xl px-6 py-3 text-sm"
          >
            {publishOpen ? "Close" : "+ Share an Opportunity"}
          </button>
        </div>
        {errorLine && (
          <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{errorLine}</p>
        )}
      </section>

      {/* Publish Composer */}
      {publishOpen && (
        <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: G.muted }}>New Listing</p>
          <h2 className="mt-1" style={{ fontFamily: G.display, fontSize: "2rem", color: G.champagne }}>
            Share an Opportunity
          </h2>
          <p className="mt-1 text-sm" style={{ color: G.muted }}>
            Publishing costs {PUBLISH_FEE} credits. Your listing reaches all verified members of the circle.
          </p>

          <div className="mt-6 grid gap-4">
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Title</p>
              <input
                value={listingTitle}
                onChange={e => setListingTitle(e.target.value)}
                placeholder="A clear, specific title"
                className="field-control"
                style={{ fontSize: "1rem" }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Type</p>
                <select
                  value={listingType}
                  onChange={e => setListingType(e.target.value as (typeof listingTypes)[number])}
                  className="field-control"
                >
                  {listingTypes.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Category</p>
                <input
                  value={listingCategory}
                  onChange={e => setListingCategory(e.target.value)}
                  placeholder="e.g. hospitality, real estate, venture"
                  className="field-control"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Summary</p>
              <textarea
                value={listingSummary}
                onChange={e => setListingSummary(e.target.value)}
                placeholder="One or two sentences — what are you offering or seeking?"
                rows={2}
                className="field-control text-sm"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Full Description</p>
              <textarea
                value={listingDescription}
                onChange={e => setListingDescription(e.target.value)}
                placeholder="Provide context, requirements, and what the right counterpart looks like."
                rows={4}
                className="field-control text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Visibility</p>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as "members" | "circle" | "private")}
                  className="field-control"
                >
                  <option value="members">All Members</option>
                  <option value="circle">Circle Only</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                  Contact Cost (credits)
                </p>
                <input
                  type="number" min={0} max={500}
                  value={creditsCost}
                  onChange={e => setCreditsCost(Number(e.target.value))}
                  className="field-control"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                  Min. Trust Score
                </p>
                <input
                  type="number" min={0} max={100}
                  value={trustRequirement}
                  onChange={e => setTrustRequirement(Number(e.target.value))}
                  className="field-control"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => void publishListing()}
                disabled={submitting}
                className="btn-primary premium-button rounded-xl px-7 py-3 text-sm disabled:opacity-50"
              >
                {submitting ? "Publishing…" : `Publish  —  ${PUBLISH_FEE} credits`}
              </button>
              <button
                onClick={() => setPublishOpen(false)}
                className="btn-quiet rounded-xl px-5 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...listingTypes] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className="rounded-full px-4 py-1.5 text-xs transition-colors"
            style={{
              border: "1px solid rgba(196,151,58,0.18)",
              background: filterType === type ? "rgba(196,151,58,0.12)" : "transparent",
              color: filterType === type ? G.champagne : G.muted,
              fontWeight: filterType === type ? 600 : 400,
              letterSpacing: "0.02em",
            }}
          >
            {type === "all" ? "All" : titleCase(type)}
          </button>
        ))}
      </div>

      {/* Feed */}
      <section className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Listings */}
        <div className="grid gap-3">
          {filteredFeed.length === 0 && (
            <article
              className="rounded-[1.4rem] p-8 text-center"
              style={{ border: "1px solid rgba(196,151,58,0.10)", background: "rgba(255,248,235,0.015)" }}
            >
              <p className="text-sm" style={{ color: G.muted }}>
                No listings match this filter. Be the first to share an opportunity.
              </p>
            </article>
          )}

          {filteredFeed.slice(0, 20).map(item => {
            const tinfo = typeLabel[item.type] ?? { label: titleCase(item.type), color: G.gold, bg: "rgba(196,151,58,0.08)" };
            const isExpanded = expandedId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-[1.4rem] p-6 sm:p-7 transition-colors"
                style={{
                  background: isExpanded ? "rgba(255,248,235,0.032)" : "rgba(255,248,235,0.018)",
                  border: `1px solid ${isExpanded ? "rgba(196,151,58,0.22)" : "rgba(196,151,58,0.10)"}`,
                }}
              >
                {/* Top row: type badge + date */}
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ background: tinfo.bg, color: tinfo.color, border: `1px solid ${tinfo.color}30` }}
                  >
                    {tinfo.label}
                    {item.category && item.category !== "general" && (
                      <span style={{ opacity: 0.65 }}> · {item.category}</span>
                    )}
                  </span>
                  <p className="text-xs shrink-0" style={{ color: "rgba(154,144,128,0.60)" }}>
                    {isoDate(item.createdAt)}
                  </p>
                </div>

                {/* Title */}
                <h2
                  className="leading-snug"
                  style={{
                    fontFamily: G.display,
                    fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
                    color: G.champagne,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {item.title}
                </h2>

                {/* Summary */}
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "rgba(237,229,208,0.76)" }}>
                  {item.summary}
                </p>

                {/* Expanded description */}
                {isExpanded && item.description && (
                  <div
                    className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
                    style={{
                      background: "rgba(255,248,235,0.025)",
                      border: "1px solid rgba(196,151,58,0.10)",
                      color: "rgba(237,229,208,0.72)",
                    }}
                  >
                    {item.description}
                  </div>
                )}

                {/* Footer: meta + actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-4 text-xs" style={{ color: "rgba(154,144,128,0.65)" }}>
                    <span style={{ textTransform: "capitalize" }}>{item.visibility} access</span>
                    {item.creditsCost > 0 && (
                      <span style={{ color: "rgba(196,151,58,0.70)" }}>
                        {item.creditsCost} credits to contact
                      </span>
                    )}
                    {item.trustRequirement > 0 && (
                      <span>Trust ≥ {item.trustRequirement}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="rounded-full px-4 py-1.5 text-xs transition-colors"
                      style={{
                        border: "1px solid rgba(196,151,58,0.20)",
                        color: G.muted,
                        background: "transparent",
                      }}
                    >
                      {isExpanded ? "Less" : "Read more"}
                    </button>
                    <Link
                      href="/network"
                      className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        border: "1px solid rgba(196,151,58,0.35)",
                        color: G.gold,
                        background: "rgba(196,151,58,0.06)",
                      }}
                    >
                      Connect via Network →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Sidebar: My listings */}
        <aside className="grid gap-3 self-start">
          <div
            className="rounded-[1.4rem] p-5"
            style={{ border: "1px solid rgba(196,151,58,0.12)", background: "rgba(255,248,235,0.018)" }}
          >
            <h2 style={{ fontFamily: G.display, fontSize: "1.5rem", color: G.champagne }}>
              My Listings
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: G.muted }}>
              Your published opportunities.
            </p>

            <div className="mt-4 grid gap-2">
              {mine.length === 0 && (
                <p className="text-sm" style={{ color: G.muted }}>
                  Nothing published yet.
                </p>
              )}
              {mine.slice(0, 8).map(item => (
                <div
                  key={item.id}
                  className="rounded-xl p-3"
                  style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.12)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug" style={{ color: G.champagne }}>
                      {item.title}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        background: item.status === "active" ? "rgba(196,151,58,0.12)" : "rgba(150,150,150,0.10)",
                        color: item.status === "active" ? G.gold : G.muted,
                        border: `1px solid ${item.status === "active" ? "rgba(196,151,58,0.25)" : "rgba(150,150,150,0.20)"}`,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: G.muted }}>
                    {titleCase(item.type)} · {isoDate(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>

            {mine.length === 0 && (
              <button
                onClick={() => setPublishOpen(true)}
                className="btn-quiet mt-3 w-full rounded-xl py-2.5 text-sm"
              >
                Share your first opportunity
              </button>
            )}
          </div>

          {/* Info card */}
          <div
            className="rounded-[1.4rem] p-5"
            style={{ border: "1px solid rgba(196,151,58,0.10)", background: "rgba(196,151,58,0.03)" }}
          >
            <p className="text-xs uppercase tracking-[0.18em]" style={{ color: G.gold }}>How it works</p>
            <div className="mt-3 grid gap-3 text-xs leading-relaxed" style={{ color: G.muted }}>
              {[
                "Publishing a listing costs 10 credits and reaches all verified members.",
                "Contacting a listing poster happens via the Network Map — find their node, send an introduction.",
                "Every interaction is intentional. Credits ensure quality, not volume.",
              ].map((txt, i) => (
                <p key={i} className="flex gap-2">
                  <span style={{ color: G.gold, flexShrink: 0 }}>{i + 1}.</span>
                  {txt}
                </p>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
