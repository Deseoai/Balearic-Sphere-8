"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl, clearSessionToken, getJson, getSessionToken, postJson, setSessionToken } from "../lib/api";
import { useLang } from "../lib/i18n";
import { AiToolsPanel } from "./ai-tools-panel";

type AuthUser = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  role: string;
  accessLevel: string;
  verificationStatus?: "none" | "pending" | "verified" | "rejected";
  isVip?: boolean;
};

type CreditTx = { id: string; amount: number; reason: string; createdAt: string; };
type CreditsResponse = { userId: string; balance: number; transactions: CreditTx[]; };
type GraphNode = {
  id: string; type: "user" | "listing" | "ai" | "circle";
  label: string; company?: string; summary: string; heat: number;
  targetUserId?: string; targetEmail?: string;
  trustScore?: number; verification?: "none" | "pending" | "verified" | "rejected";
  isVip?: boolean;
};
type GraphResponse = { nodes: GraphNode[]; };
type Listing = { id: string; title: string; summary: string; type: string; category: string; creditsCost: number; trustRequirement: number; createdAt: string; };
type ChatPeer = { email: string; displayName?: string; };
type ChatThread = { id: string; lastMessageAt?: string; lastMessagePreview?: string; peer: ChatPeer; };
type ApiList<T> = { items: T[]; };
type Pitch = { id: string; senderId: string; senderName?: string; senderCompany?: string; title: string; summary: string; ask: string; status: string; creditsCharged: number; createdAt: string; };

function titleCase(v: string): string {
  return v.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message?.trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    if (parsed.error === "invalid_or_expired_magic_link") return "This sign-in link has expired. Request a new one below.";
    if (parsed.error === "invalid_payload") return "Please check your inputs and try again.";
    if (parsed.error === "missing_session_token") return "Please request your magic link first.";
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch { /* raw */ }
  if (raw === "missing_session_token") return "Please request your magic link first.";
  return raw.slice(0, 220);
}

function getTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const token = new URL(window.location.href).searchParams.get("token");
  return token && token.length > 20 ? token : null;
}

function clearTokenInUrl(): void {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  u.searchParams.delete("token");
  window.history.replaceState({}, "", u.toString());
}

function isMemberUnlocked(user: AuthUser | null): boolean {
  if (!user) return false;
  if (["admin", "super_admin", "moderator"].includes(user.role)) return true;
  if (user.verificationStatus === "rejected" || user.verificationStatus === "pending") return false;
  return ["member", "verified_member", "premium_member", "circle_member"].includes(user.role);
}

function displayName(user: AuthUser): string {
  return user.displayName?.trim() || user.email;
}

const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
  subdued: "var(--subdued)",
  display: "var(--font-display)",
};

export function MemberWorkspace() {
  const { t } = useLang();
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const [me, setMe]               = useState<AuthUser | null>(null);
  const [credits, setCredits]     = useState<CreditsResponse | null>(null);
  const [networkUsers, setNetworkUsers] = useState<GraphNode[]>([]);
  const [listings, setListings]   = useState<Listing[]>([]);
  const [threads, setThreads]     = useState<ChatThread[]>([]);
  const [pitches, setPitches]     = useState<Pitch[]>([]);
  const [pendingPitchCount, setPendingPitchCount] = useState(0);

  const [email, setEmail]         = useState("");
  const [display, setDisplay]     = useState("");
  const [magicPreview, setMagicPreview] = useState("");

  const canUseMemberActions = isMemberUnlocked(me);

  const nextMove = useMemo(() => {
    if (!me) return {
      title: "Request your secure sign-in link",
      text: "Enter your email and receive a private magic link. You remain signed in for 30 days.",
      ctaLabel: "Request Magic Link", ctaHref: "#signin",
    };
    if (!canUseMemberActions) {
      if (me.verificationStatus === "rejected") return {
        title: "Request a manual profile review",
        text: "Your current status requires a manual review. Contact our team directly.",
        ctaLabel: "Contact Support", ctaHref: "mailto:management@balea-sphere8.com",
      };
      return {
        title: "Your application is under review",
        text: "We are reviewing your profile for Balearic relevance and trust. Strengthen your value statement to accelerate the process.",
        ctaLabel: "Refine Application", ctaHref: "/request-access",
      };
    }
    if ((credits?.balance ?? 0) < 15) return {
      title: "Add credits to unlock your first introduction",
      text: "You are ready to connect. A small credit top-up opens the door to your most relevant contacts.",
      ctaLabel: "Choose a Credit Plan", ctaHref: "/credits",
    };
    if (threads.length === 0 && networkUsers.length > 0) return {
      title: "Unlock a contact from the network map",
      text: "Select a high-relevance node, write a warm introduction, and move directly into a private thread.",
      ctaLabel: "Open Network Map", ctaHref: "/network",
    };
    if (listings.length === 0) return {
      title: "Publish your first opportunity",
      text: "A single well-crafted listing dramatically increases your visibility to the right people in this circle.",
      ctaLabel: "Open Marketplace", ctaHref: "/marketplace",
    };
    return {
      title: "Continue your active conversations",
      text: "Your strongest momentum lives in the threads already open. Follow up with intention.",
      ctaLabel: "Open Messages", ctaHref: "/messages",
    };
  }, [canUseMemberActions, credits?.balance, listings.length, me, networkUsers.length, threads.length]);

  async function loadWorkspace(): Promise<void> {
    if (!getSessionToken()) {
      setMe(null); setCredits(null); setNetworkUsers([]); setListings([]); setThreads([]); setPitches([]); setPendingPitchCount(0);
      setStatusLine("Request your secure magic link to enter.");
      setErrorLine(null);
      return;
    }
    try {
      const meRes = await getJson<{ user: AuthUser }>("/v1/auth/me", { auth: true });
      setMe(meRes.user);
      const [creditsRes, graphRes, listingRes, threadRes] = await Promise.allSettled([
        getJson<CreditsResponse>("/v1/credits/me", { auth: true }),
        getJson<GraphResponse>("/v1/network/graph?limit=48", { auth: true }),
        getJson<ApiList<Listing>>("/v1/marketplace/listings?mine=false", { auth: true }),
        getJson<ApiList<ChatThread>>("/v1/chat/threads", { auth: true }),
      ]);
      if (creditsRes.status === "fulfilled") setCredits(creditsRes.value);
      if (graphRes.status === "fulfilled") setNetworkUsers((graphRes.value.nodes ?? []).filter(n => n.type === "user").slice(0, 6));
      if (listingRes.status === "fulfilled") setListings((listingRes.value.items ?? []).slice(0, 6));
      if (threadRes.status === "fulfilled") setThreads((threadRes.value.items ?? []).slice(0, 6));
      if (meRes.user.isVip) {
        const [pitchRes, countRes] = await Promise.allSettled([
          getJson<ApiList<Pitch>>("/v1/pitches/inbox", { auth: true }),
          getJson<{ count: number }>("/v1/pitches/count", { auth: true }),
        ]);
        if (pitchRes.status === "fulfilled") setPitches(pitchRes.value.items ?? []);
        if (countRes.status === "fulfilled") setPendingPitchCount(countRes.value.count ?? 0);
      }
      setStatusLine("Workspace synchronised."); setErrorLine(null);
    } catch (error) {
      clearSessionToken();
      setMe(null); setCredits(null); setNetworkUsers([]); setListings([]); setThreads([]); setPitches([]); setPendingPitchCount(0);
      setErrorLine(friendlyError(error, "Could not load workspace."));
      setStatusLine("Please sign in again.");
    }
  }

  async function bootstrap(): Promise<void> {
    setLoading(true); setErrorLine(null);
    try {
      const tokenFromUrl = getTokenFromUrl();
      if (tokenFromUrl) {
        setStatusLine("Verifying your secure link…");
        const auth = await postJson<{ sessionToken: string; user: AuthUser }>("/v1/auth/verify-magic-link", { token: tokenFromUrl });
        setSessionToken(auth.sessionToken);
        clearTokenInUrl();
      }
      await loadWorkspace();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not verify magic link."));
      setStatusLine("Request a new link to continue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void bootstrap(); }, []);

  async function requestMagicLink(): Promise<void> {
    if (!email.includes("@")) { setErrorLine("Please enter a valid email address."); return; }
    setBusy(true); setErrorLine(null);
    try {
      const payload: { email: string; displayName?: string; redirectPath: string } = {
        email: email.trim(), redirectPath: "/workspace",
      };
      if (display.trim().length > 0) payload.displayName = display.trim();
      const result = await postJson<{ message: string; magicLinkPreview?: string }>("/v1/auth/request-magic-link", payload);
      setMagicPreview(result.magicLinkPreview ?? "");
      setStatusLine(result.message || "Magic link sent. Check your inbox.");
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not send your link."));
    } finally {
      setBusy(false);
    }
  }

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      if (getSessionToken()) await postJson("/v1/auth/logout", {}, { auth: true }).catch(() => null);
      clearSessionToken();
      setMe(null); setCredits(null); setNetworkUsers([]); setListings([]); setThreads([]); setPitches([]); setPendingPitchCount(0);
      setStatusLine("You have signed out."); setErrorLine(null);
    } finally { setBusy(false); }
  }

  /* ── Loading state ────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="surface-stage mt-4 rounded-[1.8rem] p-8 text-center">
        <p className="text-sm" style={{ color: G.muted }}>{t("workspace.loadingWorkspace")}</p>
      </section>
    );
  }

  /* ── Sign-in state ────────────────────────────────────────── */
  if (!me) {
    return (
      <div id="signin" className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Left: form */}
        <section className="surface-stage rounded-[1.8rem] p-7 sm:p-10">
          <p className="text-[10px] uppercase tracking-[0.34em]" style={{ color: G.gold }}>
            {t("workspace.eyebrow")}
          </p>
          <h1
            className="mt-4 leading-[1.05]"
            style={{ fontFamily: G.display, fontSize: "clamp(2.2rem,4vw,3rem)", color: G.champagne }}
          >
            Welcome to<br />Balea Sphere
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: G.muted }}>
            Enter your email to receive a secure, passwordless sign-in link.
            You remain authenticated on this device for up to 30 days.
          </p>

          <div className="mt-7 grid gap-3">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your email address"
              className="field-control"
              type="email"
              onKeyDown={e => { if (e.key === "Enter") void requestMagicLink(); }}
            />
            <input
              value={display}
              onChange={e => setDisplay(e.target.value)}
              placeholder="Display name (optional)"
              className="field-control"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => void requestMagicLink()}
              disabled={busy}
              className="btn-primary premium-button px-6 py-2.5 text-sm rounded-xl"
            >
              {busy ? t("common.loading") : "Send Magic Link"}
            </button>
            <a href="mailto:management@balea-sphere8.com" className="btn-quiet px-5 py-2.5 text-sm">
              Contact Support
            </a>
          </div>

          {magicPreview && (
            <div className="mt-5 rounded-xl p-3 text-sm" style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.18)" }}>
              <p style={{ color: G.muted }}>Dev preview link:</p>
              <a href={magicPreview} className="mt-1 block break-all underline" style={{ color: G.champagne }}>
                {magicPreview}
              </a>
            </div>
          )}

          <p className="mt-5 text-sm" style={{ color: G.muted }}>{statusLine}</p>
          {errorLine && <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>{errorLine}</p>}
        </section>

        {/* Right: image */}
        <div className="relative hidden overflow-hidden rounded-[1.8rem] lg:block" style={{ minHeight: "520px" }}>
          <img
            src="https://images.pexels.com/photos/1179229/pexels-photo-1179229.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1"
            alt="Balearic sea"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: "brightness(0.45) saturate(0.80)" }}
          />
          <div className="absolute inset-0 flex flex-col justify-end p-8" style={{ background: "linear-gradient(to top, rgba(12,11,9,0.90) 0%, transparent 60%)" }}>
            <p className="text-xs uppercase tracking-[0.28em] mb-2" style={{ color: G.gold }}>Mallorca · Ibiza · Menorca</p>
            <p className="leading-snug" style={{ fontFamily: G.display, fontSize: "1.9rem", color: G.champagne }}>
              A circle defined by<br />who you are, not who you know.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Member workspace ─────────────────────────────────────── */
  return (
    <div className="mt-4 grid gap-4">
      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em]" style={{ color: G.gold }}>{t("workspace.eyebrow")}</p>
            <h1
              className="mt-3 leading-tight"
              style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,2.8rem)", color: G.champagne }}
            >
              {t("workspace.welcomeBack")},<br />{displayName(me)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: G.muted }}>
              Your private command centre. Introductions, conversations, opportunities, and credits — all in one calm place.
            </p>
          </div>
          <button
            onClick={() => void logout()}
            disabled={busy}
            className="btn-quiet rounded-xl px-4 py-2 text-sm"
          >
            {t("nav.signOut")}
          </button>
        </div>

        {/* Status chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { label: "Role", value: titleCase(me.role) },
            { label: "Access", value: titleCase(me.accessLevel) },
            { label: "Status", value: titleCase(me.verificationStatus ?? "none") },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{ background: "rgba(196,151,58,0.07)", border: "1px solid rgba(196,151,58,0.16)" }}
            >
              <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: G.muted }}>{label}</span>
              <span className="text-xs font-medium" style={{ color: G.champagne }}>{value}</span>
            </div>
          ))}
          {me.isVip && (
            <div
              className="flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{ background: "rgba(212,168,74,0.13)", border: "1px solid rgba(212,168,74,0.45)" }}
            >
              <span className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "#D4A84A" }}>VIP</span>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs" style={{ color: G.muted }}>{statusLine}</p>
        {errorLine && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errorLine}</p>}
      </section>

      {/* Next Best Move */}
      <section className="surface-elevated rounded-[1.6rem] p-6 sm:p-7">
        <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: G.muted }}>{t("workspace.quickActions")}</p>
        <h2
          className="mt-2 leading-tight"
          style={{ fontFamily: G.display, fontSize: "clamp(1.6rem,3vw,2.2rem)", color: G.champagne }}
        >
          {nextMove.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: G.muted }}>{nextMove.text}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={nextMove.ctaHref} className="btn-primary premium-button rounded-xl px-6 py-2.5 text-sm">
            {nextMove.ctaLabel}
          </Link>
          <Link href="/network" className="btn-quiet rounded-xl px-5 py-2.5 text-sm">{t("workspace.viewNetwork")}</Link>
          <Link href="/messages" className="btn-quiet rounded-xl px-5 py-2.5 text-sm">{t("nav.messages")}</Link>
        </div>
      </section>

      {/* Review State Banner */}
      {!canUseMemberActions && (
        <section
          className="rounded-[1.5rem] p-5"
          style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.18)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.26em]" style={{ color: G.gold }}>Under Review</p>
          <h3 className="mt-1 text-lg font-medium" style={{ color: G.champagne }}>
            Member actions unlock after your application is approved
          </h3>
          <p className="mt-1 text-sm" style={{ color: G.muted }}>
            You can already explore the platform and prepare your profile. Once approved, introductions, publishing, and direct member actions unlock automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/request-access" className="btn-secondary premium-button rounded-xl px-5 py-2.5 text-sm">
              Refine Application
            </Link>
            <a href="mailto:management@balea-sphere8.com" className="btn-quiet rounded-xl px-5 py-2.5 text-sm">
              Ask Support
            </a>
          </div>
        </section>
      )}

      {/* VIP — Earnings explanation */}
      {me.isVip && canUseMemberActions && (
        <section
          className="rounded-[1.5rem] p-5 sm:p-6"
          style={{ background: "linear-gradient(135deg, rgba(212,168,74,0.06) 0%, rgba(196,151,58,0.03) 100%)", border: "1px solid rgba(212,168,74,0.22)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.32em] mb-3" style={{ color: "#D4A84A" }}>Your VIP Earnings</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            As a VIP member, you earn credits passively — simply by being present and reachable in the network.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { icon: "◎", label: "Intro received", value: "+8 cr", desc: "Every time a member sends you an introduction request" },
              { icon: "◈", label: "Profile viewed", value: "+3 cr", desc: "Every 10 profile views in the Network Map" },
              { icon: "⬡", label: "Pitch accepted", value: "+20 cr", desc: "Each time you accept a pitch from the community" },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3" style={{ background: "rgba(212,168,74,0.05)", border: "1px solid rgba(212,168,74,0.14)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base" style={{ color: "#D4A84A" }}>{item.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--champagne)" }}>{item.label}</span>
                </div>
                <p className="text-lg font-bold mb-1" style={{ color: "#D4A84A", fontFamily: "var(--font-display)" }}>{item.value}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* VIP — Protected Access panel */}
      {me.isVip && canUseMemberActions && (
        <section
          className="rounded-[1.5rem] p-5 sm:p-6"
          style={{ background: "linear-gradient(135deg, rgba(212,168,74,0.08) 0%, rgba(196,151,58,0.04) 100%)", border: "1px solid rgba(212,168,74,0.28)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: "#D4A84A" }}>Protected Access</p>
              <h3
                className="mt-1.5 leading-tight"
                style={{ fontFamily: G.display, fontSize: "clamp(1.4rem,2.5vw,1.8rem)", color: G.champagne }}
              >
                {threads.length > 0
                  ? `${threads.length} active conversation${threads.length === 1 ? "" : "s"}`
                  : "Your network signal is live"}
              </h3>
              <p className="mt-1 text-sm" style={{ color: G.muted }}>
                {threads.length > 0
                  ? "Serious contacts only reach you — every introduction is deliberate by design."
                  : "Members who reach out to you invest double the credits. Only the serious ones do."}
              </p>
            </div>
            <Link href="/messages" className="btn-secondary rounded-xl px-5 py-2.5 text-sm shrink-0">
              View Conversations
            </Link>
          </div>
        </section>
      )}

      {/* VIP — Private Pitch Inbox */}
      {me.isVip && canUseMemberActions && (
        <section
          className="rounded-[1.5rem] p-5 sm:p-6"
          style={{ background: "linear-gradient(135deg, rgba(212,168,74,0.06) 0%, rgba(196,151,58,0.03) 100%)", border: "1px solid rgba(212,168,74,0.20)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: "#D4A84A" }}>Private Pitch Inbox</p>
                {pendingPitchCount > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(212,168,74,0.25)", color: "#D4A84A", border: "1px solid rgba(212,168,74,0.45)" }}
                  >
                    {pendingPitchCount}
                  </span>
                )}
              </div>
              <h3
                className="mt-1 leading-tight"
                style={{ fontFamily: G.display, fontSize: "clamp(1.3rem,2.2vw,1.6rem)", color: G.champagne }}
              >
                {pitches.length > 0 ? `${pitches.length} pitch${pitches.length === 1 ? "" : "es"} received` : "No pitches yet"}
              </h3>
              <p className="mt-1 text-sm" style={{ color: G.muted }}>
                Founders and members invest 25 credits to send you a curated business pitch.
              </p>
            </div>
          </div>

          {pitches.length > 0 && (
            <div className="space-y-3">
              {pitches.slice(0, 5).map(pitch => (
                <PitchCard
                  key={pitch.id}
                  pitch={pitch}
                  onDecision={async (id: string, status: "accepted" | "declined") => {
                    const token = getSessionToken();
                    if (!token) return;
                    try {
                      const res = await fetch(`${apiBaseUrl}/v1/pitches/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ status }),
                      });
                      if (!res.ok) return;
                      setPitches(prev => prev.map(p => p.id === id ? { ...p, status } : p));
                      if (status === "accepted" || status === "declined") {
                        setPendingPitchCount(prev => Math.max(0, prev - 1));
                      }
                    } catch { /* silent */ }
                  }}
                />
              ))}
            </div>
          )}

          {pitches.length === 0 && (
            <p className="text-sm" style={{ color: G.muted }}>
              When a member sends you a private pitch, it will appear here. Only you can see these.
            </p>
          )}
        </section>
      )}

      {/* AI Tools */}
      {canUseMemberActions && (
        <AiToolsPanel
          balance={credits?.balance ?? 0}
          onCreditSpent={() => { void loadWorkspace(); }}
        />
      )}

      {/* Credits + Quick Actions */}
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="surface-elevated rounded-[1.4rem] p-5">
          <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: G.muted }}>{t("workspace.yourCredits")}</p>
          <p
            className="mt-2 font-semibold"
            style={{ fontFamily: G.display, fontSize: "3rem", color: G.champagne, lineHeight: 1 }}
          >
            {credits?.balance ?? 0}
          </p>
          <p className="mt-1 text-xs" style={{ color: G.muted }}>Available access credits</p>
          <Link href="/credits" className="btn-secondary mt-4 inline-block rounded-xl px-4 py-2 text-xs">
            Manage Credits
          </Link>
          <div className="mt-3 space-y-1">
            {(credits?.transactions ?? []).slice(0, 3).map(tx => (
              <p key={tx.id} className="text-xs" style={{ color: G.muted }}>
                <span style={{ color: tx.amount > 0 ? "#9dcf88" : "var(--danger)" }}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
                {" "}· {tx.reason}
              </p>
            ))}
          </div>
        </article>

        <article className="surface-elevated rounded-[1.4rem] p-5 lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: G.muted }}>{t("workspace.quickActions")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { href: "/network",    title: "Network Map",      desc: "Discover members. Unlock introductions." },
              { href: "/messages",   title: "Messages",         desc: "Continue private threads with context." },
              { href: "/marketplace",title: "Marketplace",      desc: "Publish offers. Discover curated demand." },
              { href: "/credits",    title: "Credit Plans",     desc: "Plan your access rhythm clearly." },
            ].map(({ href, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl p-4 transition-colors"
                style={{ background: "rgba(255,248,235,0.025)", border: "1px solid rgba(196,151,58,0.10)" }}
              >
                <p className="text-sm font-medium" style={{ color: G.champagne }}>{title}</p>
                <p className="mt-1 text-xs" style={{ color: G.muted }}>{desc}</p>
              </Link>
            ))}
          </div>
        </article>
      </section>

      {/* Suggested + Threads + Listings */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Suggested Members */}
        <article className="surface-elevated rounded-[1.4rem] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.20em]" style={{ color: G.muted }}>{t("workspace.viewNetwork")}</p>
            <Link href="/network" className="text-xs underline" style={{ color: G.gold }}>View map</Link>
          </div>
          <div className="mt-3 space-y-2">
            {networkUsers.slice(0, 4).map(item => (
              <div
                key={item.id}
                className="rounded-xl p-3"
                style={{
                  background: item.isVip ? "rgba(212,168,74,0.04)" : "rgba(255,248,235,0.020)",
                  border: item.isVip ? "1px solid rgba(212,168,74,0.18)" : "1px solid rgba(196,151,58,0.08)"
                }}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium" style={{ color: G.champagne }}>{item.company || item.label}</p>
                  {item.isVip && (
                    <span className="text-[8px] font-bold uppercase tracking-[0.18em] rounded-full px-1.5 py-0.5" style={{ color: "#D4A84A", background: "rgba(212,168,74,0.12)", border: "1px solid rgba(212,168,74,0.30)" }}>VIP</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs" style={{ color: G.muted }}>{item.summary || "Member"}</p>
              </div>
            ))}
            {networkUsers.length === 0 && (
              <p className="text-xs" style={{ color: G.muted }}>{t("workspace.signInPrompt")}</p>
            )}
          </div>
        </article>

        {/* Conversations */}
        <article className="surface-elevated rounded-[1.4rem] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.20em]" style={{ color: G.muted }}>{t("workspace.recentActivity")}</p>
            <Link href="/messages" className="text-xs underline" style={{ color: G.gold }}>Open</Link>
          </div>
          <div className="mt-3 space-y-2">
            {threads.slice(0, 4).map(thread => (
              <div
                key={thread.id}
                className="rounded-xl p-3"
                style={{ background: "rgba(255,248,235,0.020)", border: "1px solid rgba(196,151,58,0.08)" }}
              >
                <p className="text-sm font-medium" style={{ color: G.champagne }}>
                  {thread.peer.displayName || thread.peer.email}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: G.muted }}>
                  {thread.lastMessagePreview || "No messages yet."}
                </p>
              </div>
            ))}
            {threads.length === 0 && (
              <p className="text-xs" style={{ color: G.muted }}>{t("workspace.noRecentActivity")}</p>
            )}
          </div>
        </article>

        {/* Marketplace Highlights */}
        <article className="surface-elevated rounded-[1.4rem] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.20em]" style={{ color: G.muted }}>{t("workspace.viewMarketplace")}</p>
            <Link href="/marketplace" className="text-xs underline" style={{ color: G.gold }}>Browse</Link>
          </div>
          <div className="mt-3 space-y-2">
            {listings.slice(0, 4).map(item => (
              <div
                key={item.id}
                className="rounded-xl p-3"
                style={{ background: "rgba(255,248,235,0.020)", border: "1px solid rgba(196,151,58,0.08)" }}
              >
                <p className="text-sm font-medium" style={{ color: G.champagne }}>{item.title}</p>
                <p className="mt-0.5 text-xs" style={{ color: G.muted }}>{item.summary}</p>
                <p className="mt-1 text-[10px]" style={{ color: "rgba(196,151,58,0.60)" }}>
                  {titleCase(item.type)} · {titleCase(item.category)}
                </p>
              </div>
            ))}
            {listings.length === 0 && (
              <p className="text-xs" style={{ color: G.muted }}>{t("common.noResults")}</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function PitchCard({
  pitch,
  onDecision,
}: {
  pitch: Pitch;
  onDecision: (id: string, status: "accepted" | "declined") => Promise<void>;
}) {
  const [deciding, setDeciding] = useState(false);
  const G2 = { gold: "var(--gold)", champagne: "var(--champagne)", muted: "var(--text-secondary)" };
  const statusColors: Record<string, { color: string; bg: string; border: string }> = {
    pending:  { color: "#D4A84A", bg: "rgba(212,168,74,0.10)", border: "rgba(212,168,74,0.28)" },
    accepted: { color: "#a0c890", bg: "rgba(74,124,89,0.12)",  border: "rgba(74,124,89,0.28)" },
    declined: { color: "#e8b4bc", bg: "rgba(155,58,74,0.12)",  border: "rgba(155,58,74,0.28)" },
  };
  const sc = statusColors[pitch.status] ?? statusColors.pending;

  async function handle(status: "accepted" | "declined") {
    setDeciding(true);
    await onDecision(pitch.id, status);
    setDeciding(false);
  }

  return (
    <div className="pitch-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: G2.champagne }}>{pitch.title}</p>
          {pitch.senderCompany && (
            <p className="text-xs mt-0.5" style={{ color: G2.muted }}>{pitch.senderCompany}</p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] uppercase font-semibold tracking-[0.12em]"
          style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}
        >
          {pitch.status}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(237,229,208,0.74)" }}>{pitch.summary}</p>
      <p className="mt-1.5 text-xs italic" style={{ color: "rgba(196,168,232,0.70)" }}>Ask: {pitch.ask}</p>
      {pitch.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void handle("accepted")}
            disabled={deciding}
            className="btn-primary premium-button rounded-lg px-4 py-1.5 text-xs disabled:opacity-50"
          >
            Accept +20 cr
          </button>
          <button
            onClick={() => void handle("declined")}
            disabled={deciding}
            className="btn-quiet rounded-lg px-4 py-1.5 text-xs"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
