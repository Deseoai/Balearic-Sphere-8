"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getJson, getSessionToken, postJson } from "../lib/api";

type CreditPackage = { id: "starter" | "growth" | "circle"; label: string; credits: number; priceEur: number; };
type PackagesResponse = { currency: string; items: CreditPackage[]; };
type CreditTx = { id: string; type: string; amount: number; reason: string; createdAt: string; };
type CreditsResponse = { userId: string; balance: number; transactions: CreditTx[]; };

const ACTION_COSTS = {
  aiRequest: 8, concierge: 5, listingPublish: 10, circleRequest: 12, introUnlock: 15,
} as const;

const PLAN_FRAMING: Record<CreditPackage["id"], {
  subtitle: string; tagline: string; audience: string; unlocks: string[];
}> = {
  starter: {
    subtitle: "Access Starter",
    tagline: "First steps, low friction.",
    audience: "Ideal for new members finding their footing in the circle.",
    unlocks: ["First qualified introductions", "AI guidance and concierge", "Light marketplace visibility"],
  },
  growth: {
    subtitle: "Circle Momentum",
    tagline: "For active members building momentum.",
    audience: "Best for members with consistent weekly engagement.",
    unlocks: ["Regular introductions and threads", "Steady marketplace activity", "Advanced AI workflows"],
  },
  circle: {
    subtitle: "Inner Circle",
    tagline: "Full access. No friction.",
    audience: "For serious operators running multiple strategic tracks simultaneously.",
    unlocks: ["High-frequency introductions", "Private deal facilitation", "Priority access workflows", "Unlimited AI concierge"],
  },
};

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message.trim();
  try {
    const p = JSON.parse(raw) as { error?: string; message?: string };
    if (p.error === "missing_session_token" || p.error === "invalid_or_expired_session") {
      return "Sign in from Workspace to load your credit status.";
    }
    if (p.error === "payment_provider_required") {
      return "Live checkout is currently processed manually. Contact support and we will top up your account within minutes.";
    }
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  return raw.slice(0, 220);
}

function estimateFromPlanner(input: { ai: number; intros: number; listings: number; circles: number }): number {
  return (
    input.ai * ACTION_COSTS.aiRequest +
    input.intros * ACTION_COSTS.introUnlock +
    input.listings * ACTION_COSTS.listingPublish +
    input.circles * ACTION_COSTS.circleRequest
  );
}

type ReferralCode = { code: string; uses: number; rewardPerUse: number; isVip: boolean; referralUrl: string; };

export function CreditsStudio() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"credits" | "referral">(() =>
    searchParams?.get("tab") === "referral" ? "referral" : "credits"
  );
  const [loading, setLoading]     = useState(true);
  const [statusLine, setStatusLine] = useState("Loading plans…");
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [buying, setBuying]       = useState<string | null>(null);
  const [packages, setPackages]   = useState<CreditPackage[]>([]);
  const [credits, setCredits]     = useState<CreditsResponse | null>(null);

  const [planAi, setPlanAi]             = useState(4);
  const [planIntros, setPlanIntros]     = useState(2);
  const [planListings, setPlanListings] = useState(1);
  const [planCircles, setPlanCircles]   = useState(1);

  const [referral, setReferral]         = useState<ReferralCode | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const confirmedRef = useRef(false);

  async function refresh(): Promise<void> {
    setLoading(true); setErrorLine(null);
    try {
      const [packRes, myCredits] = await Promise.all([
        getJson<PackagesResponse>("/v1/credits/packages"),
        getSessionToken() ? getJson<CreditsResponse>("/v1/credits/me", { auth: true }).catch(() => null) : Promise.resolve(null),
      ]);
      setPackages(packRes.items ?? []);
      setCredits(myCredits);
      setStatusLine(myCredits ? "Your balance and plans are up to date." : "Plans loaded. Sign in to unlock purchase.");
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not load credit plans."));
      setStatusLine("Plans unavailable.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  // Handle Stripe redirect back to this page
  useEffect(() => {
    if (confirmedRef.current) return;
    const status = searchParams?.get("status");
    const sessionId = searchParams?.get("session_id");
    const pkg = searchParams?.get("pkg");
    if (status === "success" && sessionId && getSessionToken()) {
      confirmedRef.current = true;
      void (async () => {
        try {
          await postJson("/v1/credits/confirm-checkout", { sessionId }, { auth: true });
          setStatusLine(`Payment confirmed. ${pkg ? `${pkg.charAt(0).toUpperCase() + pkg.slice(1)} credits` : "Credits"} have been added to your account.`);
          await refresh();
        } catch {
          setStatusLine("Payment received. Credits will appear shortly — refresh if needed.");
        }
      })();
    } else if (status === "cancelled") {
      setStatusLine("Payment cancelled. Choose a plan when you're ready.");
    }
  }, []);

  async function loadReferral(): Promise<void> {
    if (!getSessionToken()) return;
    setReferralLoading(true); setReferralError(null);
    try {
      const res = await getJson<ReferralCode>("/v1/referrals/my-code", { auth: true });
      setReferral(res);
    } catch (error) {
      setReferralError(friendlyError(error, "Could not load referral code."));
    } finally { setReferralLoading(false); }
  }

  useEffect(() => {
    if (activeTab === "referral") void loadReferral();
  }, [activeTab]);

  function copyCode(): void {
    if (!referral) return;
    void navigator.clipboard.writeText(referral.referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const estimated = useMemo(
    () => estimateFromPlanner({ ai: planAi, intros: planIntros, listings: planListings, circles: planCircles }),
    [planAi, planIntros, planListings, planCircles]
  );

  const recommended = useMemo(() => {
    if (!packages.length) return null;
    return packages.find(p => p.credits >= estimated) ?? packages[packages.length - 1];
  }, [estimated, packages]);

  async function buy(packageId: CreditPackage["id"]): Promise<void> {
    setBuying(packageId); setErrorLine(null);
    try {
      const res = await postJson<{ url: string }>("/v1/credits/checkout", { packageId }, { auth: true });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      throw new Error("No checkout URL returned.");
    } catch (error) {
      setErrorLine(friendlyError(error, "Purchase could not be completed."));
      setBuying(null);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Tab switcher */}
      <div className="flex gap-2">
        {([
          { id: "credits", label: "Credits" },
          { id: "referral", label: "Refer & Earn" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: activeTab === tab.id ? "rgba(196,151,58,0.18)" : "rgba(196,151,58,0.05)",
              border: activeTab === tab.id ? "1px solid rgba(196,151,58,0.40)" : "1px solid rgba(196,151,58,0.15)",
              color: activeTab === tab.id ? G.champagne : G.muted,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Referral tab */}
      {activeTab === "referral" && (
        <div className="grid gap-4">
          <section className="surface-stage rounded-[1.8rem] p-5 sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.34em]" style={{ color: G.gold }}>Refer & Earn</p>
            <h1 className="mt-3 leading-tight" style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,2.8rem)", color: G.champagne }}>
              Grow the circle.<br />Earn together.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: G.muted }}>
              Share your unique referral link with trusted operators. When they join and get verified, you both earn credits — no cap, no expiry.
            </p>
          </section>

          {/* Reward structure */}
          <section className="surface-elevated rounded-[1.5rem] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] mb-4" style={{ color: G.muted }}>Reward Structure</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "You earn (Standard)", value: "20 cr", desc: "Per verified referral" },
                { label: "You earn (VIP)", value: "40 cr", desc: "Double reward for VIP members" },
                { label: "New member earns", value: "10 cr", desc: "Welcome bonus on signup" },
              ].map(({ label, value, desc }) => (
                <div key={label} className="rounded-xl p-4 text-center"
                  style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.14)" }}>
                  <p className="text-2xl font-semibold" style={{ color: G.champagne, fontFamily: G.display }}>{value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: G.gold }}>{label}</p>
                  <p className="mt-0.5 text-xs" style={{ color: G.muted }}>{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Referral code — 2-col on desktop */}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <section className="surface-elevated rounded-[1.5rem] p-5">
              <p className="text-[10px] uppercase tracking-[0.22em] mb-4" style={{ color: G.muted }}>Your Referral Link</p>
              {!getSessionToken() && (
                <p className="text-sm" style={{ color: G.muted }}>Sign in from Workspace to get your personal referral link.</p>
              )}
              {getSessionToken() && referralLoading && (
                <p className="text-sm" style={{ color: G.muted }}>Loading your referral code…</p>
              )}
              {referralError && (
                <p className="text-sm" style={{ color: "var(--danger)" }}>{referralError}</p>
              )}
              {referral && (
                <div className="grid gap-3">
                  {referral.isVip && (
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 self-start"
                      style={{ background: "rgba(196,151,58,0.12)", border: "1px solid rgba(196,151,58,0.30)" }}>
                      <span className="text-xs font-semibold" style={{ color: G.gold }}>✦ VIP — earning 40 cr per referral</span>
                    </div>
                  )}
                  <div className="rounded-xl p-4"
                    style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.22)" }}>
                    <p className="text-[10px] uppercase tracking-[0.16em] mb-1" style={{ color: G.muted }}>Your Code</p>
                    <p className="text-lg font-semibold tracking-widest" style={{ color: G.champagne, fontFamily: G.display }}>{referral.code}</p>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(196,151,58,0.14)" }}>
                    <p className="flex-1 text-sm truncate min-w-0" style={{ color: G.muted }}>{referral.referralUrl}</p>
                    <button
                      onClick={copyCode}
                      className="rounded-lg px-4 py-2 text-xs font-semibold shrink-0 transition-colors"
                      style={{
                        background: copied ? "rgba(157,207,136,0.15)" : "rgba(196,151,58,0.12)",
                        border: copied ? "1px solid rgba(157,207,136,0.40)" : "1px solid rgba(196,151,58,0.30)",
                        color: copied ? "#9dcf88" : G.gold,
                      }}
                    >
                      {copied ? "Copied ✓" : "Copy Link"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(196,151,58,0.08)" }}>
                    <p className="text-sm" style={{ color: G.muted }}>Total referrals so far</p>
                    <p className="text-xl font-semibold" style={{ color: G.champagne, fontFamily: G.display }}>{referral.uses}</p>
                  </div>
                </div>
              )}
            </section>

            {/* How it works — second column on desktop */}
            <section className="surface-elevated rounded-[1.5rem] p-5">
              <p className="text-[10px] uppercase tracking-[0.22em] mb-4" style={{ color: G.muted }}>How It Works</p>
              <div className="grid gap-3">
                {[
                  { step: "01", title: "Share your link", desc: "Send your unique referral link to trusted founders, operators, and investors in the Balearics." },
                  { step: "02", title: "They apply & get verified", desc: "Your referral submits their application. Once verified and approved, the reward triggers automatically." },
                  { step: "03", title: "Both earn credits", desc: "You earn 20 cr (or 40 cr if you're VIP). They receive a 10 cr welcome bonus. No cap, no expiry." },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3 rounded-xl p-3"
                    style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.10)" }}>
                    <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: G.gold }}>{step}</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: G.champagne }}>{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: G.muted }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Credits tab */}
      {activeTab === "credits" && <>
      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-5 sm:p-7">
        <p className="text-[10px] uppercase tracking-[0.34em]" style={{ color: G.gold }}>Credits Studio</p>
        <h1 className="mt-3 leading-tight" style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,2.8rem)", color: G.champagne }}>
          Intentional access.<br />Clear value.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: G.muted }}>
          Credits are not a paywall. They are a deliberate quality filter that keeps every introduction, conversation, and opportunity high-signal and high-trust. You spend only when you choose to unlock something of real value.
        </p>

        {credits && (
          <div
            className="mt-5 inline-flex items-center gap-3 rounded-xl px-5 py-3"
            style={{ background: "rgba(196,151,58,0.08)", border: "1px solid rgba(196,151,58,0.22)" }}
          >
            <span className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>Current Balance</span>
            <span
              className="font-semibold"
              style={{ fontFamily: G.display, fontSize: "2rem", color: G.champagne, lineHeight: 1 }}
            >
              {credits.balance}
            </span>
            <span className="text-xs" style={{ color: G.muted }}>credits</span>
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: G.muted }}>{statusLine}</p>
        {errorLine && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errorLine}</p>}
      </section>

      {/* Action costs reference */}
      <section className="surface-elevated rounded-[1.5rem] p-5">
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>What Credits Unlock</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { action: "Introduction", cost: ACTION_COSTS.introUnlock },
            { action: "Open Chat Thread", cost: 12 },
            { action: "Publish Listing", cost: ACTION_COSTS.listingPublish },
            { action: "Circle Request", cost: ACTION_COSTS.circleRequest },
            { action: "AI Request", cost: ACTION_COSTS.aiRequest },
            { action: "Pitch to VIP", cost: 25 },
          ].map(({ action, cost }) => (
            <div
              key={action}
              className="rounded-xl p-3 text-center"
              style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.12)" }}
            >
              <p className="text-xl font-semibold" style={{ color: G.champagne }}>{cost}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em]" style={{ color: G.muted }}>{action}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planner */}
      <section className="surface-elevated rounded-[1.5rem] p-5">
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>Monthly Planner</p>
        <h2 className="mt-1" style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>
          Estimate your credit rhythm
        </h2>
        <p className="mt-1 text-sm" style={{ color: G.muted }}>
          Slide to match your expected monthly activity. We recommend the most suitable plan in real time.
        </p>

        <div className="mt-4 grid gap-4">
          <PlannerSlider label="AI requests" count={planAi} min={0} max={16} onChange={setPlanAi} />
          <PlannerSlider label="Introduction unlocks" count={planIntros} min={0} max={16} onChange={setPlanIntros} />
          <PlannerSlider label="Marketplace listings" count={planListings} min={0} max={12} onChange={setPlanListings} />
          <PlannerSlider label="Circle access requests" count={planCircles} min={0} max={8} onChange={setPlanCircles} />
        </div>

        <div
          className="mt-5 rounded-xl p-4"
          style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.18)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: G.muted }}>Estimated Monthly Credits</p>
              <p className="mt-1 text-3xl font-semibold" style={{ color: G.champagne }}>{estimated}</p>
            </div>
            {recommended && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: G.gold }}>Best fit</p>
                <p className="mt-1 text-base font-medium" style={{ color: G.champagne }}>
                  {PLAN_FRAMING[recommended.id].subtitle}
                </p>
                <p className="text-xs" style={{ color: G.muted }}>{recommended.credits} credits</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="surface-elevated rounded-[1.5rem] p-5">
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>Access Plans</p>
        <h2 className="mt-1" style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>
          Choose your access pace
        </h2>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {packages.map(pack => {
            const isRecommended = recommended?.id === pack.id;
            const framing = PLAN_FRAMING[pack.id];
            return (
              <article
                key={pack.id}
                className="flex flex-col rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
                style={{
                  background: isRecommended ? "rgba(196,151,58,0.08)" : "rgba(255,248,235,0.022)",
                  border: isRecommended ? "1px solid rgba(196,151,58,0.35)" : "1px solid rgba(196,151,58,0.10)",
                }}
              >
                {isRecommended && (
                  <span
                    className="mb-3 self-start rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] font-semibold"
                    style={{ background: "rgba(196,151,58,0.18)", color: G.gold, border: "1px solid rgba(196,151,58,0.35)" }}
                  >
                    Best fit now
                  </span>
                )}
                <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: G.muted }}>{framing.subtitle}</p>
                <h3 className="mt-1" style={{ fontFamily: G.display, fontSize: "1.5rem", color: G.champagne }}>{pack.label}</h3>
                <p className="mt-1 text-xs italic" style={{ color: "rgba(196,151,58,0.75)" }}>{framing.tagline}</p>
                <p className="mt-3 text-sm" style={{ color: G.muted }}>{framing.audience}</p>

                <div className="my-4" style={{ borderTop: "1px solid rgba(196,151,58,0.12)" }} />

                <p className="text-3xl font-semibold" style={{ color: G.champagne, fontFamily: G.display }}>€{pack.priceEur}</p>
                <p className="text-sm" style={{ color: G.muted }}>{pack.credits} credits</p>

                <ul className="mt-3 flex-1 space-y-1.5 text-xs" style={{ color: G.muted }}>
                  {framing.unlocks.map(line => (
                    <li key={line} className="flex items-start gap-2">
                      <span style={{ color: G.gold }}>·</span>
                      {line}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => void buy(pack.id)}
                  disabled={loading || buying === pack.id || !getSessionToken()}
                  className={`${isRecommended ? "btn-primary" : "btn-secondary"} premium-button mt-5 w-full rounded-xl px-4 py-2.5 text-sm disabled:opacity-50`}
                >
                  {buying === pack.id ? "Processing…" : `Choose ${framing.subtitle}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Why Credits */}
      <section className="surface-elevated rounded-[1.5rem] p-5">
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>The Philosophy</p>
        <h2 className="mt-1" style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>
          Why credits create better outcomes
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { title: "Signal over noise", text: "Credits prevent low-effort outreach. Every action carries weight, which raises the quality of every interaction in the circle." },
            { title: "Strategic intention", text: "You spend when you choose to unlock a specific, high-value move. Not by default, not by accident." },
            { title: "Trust as currency", text: "Members who invest intentionally build stronger reputations. The credit system amplifies the signal of serious operators." },
          ].map(({ title, text }) => (
            <div
              key={title}
              className="rounded-xl p-4"
              style={{ background: "rgba(255,248,235,0.020)", border: "1px solid rgba(196,151,58,0.10)" }}
            >
              <div className="mb-2 h-px w-6" style={{ background: G.gold }} />
              <p className="text-sm font-medium" style={{ color: G.champagne }}>{title}</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: G.muted }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="surface-elevated rounded-[1.5rem] p-5">
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>Recent Activity</p>
        <h2 className="mt-1" style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>Credit timeline</h2>
        <div className="mt-4 space-y-2">
          {(credits?.transactions ?? []).slice(0, 8).map(tx => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-xl p-3"
              style={{ background: "rgba(255,248,235,0.020)", border: "1px solid rgba(196,151,58,0.08)" }}
            >
              <p className="text-sm" style={{ color: G.champagne }}>{tx.reason}</p>
              <div className="text-right">
                <p
                  className="text-sm font-semibold"
                  style={{ color: tx.amount > 0 ? "#9dcf88" : "var(--danger)" }}
                >
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </p>
                <p className="text-[10px]" style={{ color: G.muted }}>
                  {new Date(tx.createdAt).toLocaleDateString("en-GB")}
                </p>
              </div>
            </div>
          ))}
          {!credits && (
            <p className="text-sm" style={{ color: G.muted }}>Sign in from Workspace to see your live credit history.</p>
          )}
          {credits && credits.transactions.length === 0 && (
            <p className="text-sm" style={{ color: G.muted }}>No transactions yet. Your welcome credits will appear here.</p>
          )}
        </div>
      </section>
      </>}
    </div>
  );
}

function PlannerSlider({
  label, count, onChange, min, max,
}: { label: string; count: number; min: number; max: number; onChange: (v: number) => void; }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: "rgba(196,151,58,0.12)", color: "var(--champagne)", border: "1px solid rgba(196,151,58,0.25)" }}
        >
          {count}/mo
        </span>
      </div>
      <input
        type="range"
        value={count}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
