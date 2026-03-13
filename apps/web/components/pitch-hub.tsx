"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl, getJson, getSessionToken, postJson } from "../lib/api";

type AuthUser = { userId: string; email: string; displayName?: string; isVip?: boolean; };
type GraphNode = {
  id: string; type: "user" | "listing" | "ai" | "circle";
  label: string; company?: string; summary: string; heat: number;
  targetUserId?: string; isVip?: boolean; category?: string; industry?: string;
  avatarUrl?: string;
};
type GraphResponse = { nodes: GraphNode[]; };
type Pitch = {
  id: string; senderId: string; senderName?: string; senderCompany?: string;
  title: string; summary: string; ask: string; status: string;
  creditsCharged: number; createdAt: string;
};
type CreditBalance = { balance: number; };

const PITCH_COST = 25;
const PITCH_REWARD = 20;

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message.trim();
  try {
    const p = JSON.parse(raw) as { error?: string; message?: string; required?: number; balance?: number };
    if (p.error === "missing_session_token" || p.error === "invalid_or_expired_session") return "Sign in from Workspace first.";
    if (p.error === "recipient_not_vip") return "Pitches can only be sent to VIP members.";
    if (p.error === "insufficient_credits") {
      const req = typeof p.required === "number" ? p.required : PITCH_COST;
      const bal = typeof p.balance === "number" ? p.balance : 0;
      return `Not enough credits — need ${req}, you have ${bal}. Visit Credits to top up.`;
    }
    if (p.error === "vip_required") return "Pitch inbox is exclusive to VIP members.";
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  return raw.slice(0, 220);
}

function isoDate(v: string): string {
  try { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(v)); }
  catch { return v; }
}

function displayLabel(node: GraphNode): string {
  return node.company || node.label || "Member";
}

const statusColors: Record<string, { color: string; bg: string; border: string }> = {
  pending:  { color: "#D4A84A", bg: "rgba(212,168,74,0.10)", border: "rgba(212,168,74,0.28)" },
  accepted: { color: "#a0c890", bg: "rgba(74,124,89,0.12)", border: "rgba(74,124,89,0.28)" },
  declined: { color: "#e8b4bc", bg: "rgba(155,58,74,0.12)", border: "rgba(155,58,74,0.28)" },
};

function VipAvatar({ node }: { node: GraphNode }) {
  const initials = (node.company || node.label || "?").slice(0, 2).toUpperCase();
  return node.avatarUrl ? (
    <img src={node.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0"
      style={{ border: "1px solid rgba(196,151,58,0.30)" }} />
  ) : (
    <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0"
      style={{ background: "rgba(196,151,58,0.15)", color: G.gold, border: "1px solid rgba(196,151,58,0.25)" }}>
      {initials}
    </div>
  );
}

export function PitchHub() {
  const [me, setMe]             = useState<AuthUser | null>(null);
  const [loading, setLoading]   = useState(true);
  const [balance, setBalance]   = useState<number | null>(null);
  const [vipNodes, setVipNodes] = useState<GraphNode[]>([]);
  const [inbox, setInbox]       = useState<Pitch[]>([]);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [successLine, setSuccessLine] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [pitchTitle, setPitchTitle]     = useState("");
  const [pitchSummary, setPitchSummary] = useState("");
  const [pitchAsk, setPitchAsk]         = useState("");
  const [deckUrl, setDeckUrl]           = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [decidingId, setDecidingId]     = useState<string | null>(null);

  const isVip = me?.isVip ?? false;

  const selectedVip = useMemo(
    () => vipNodes.find(n => n.targetUserId === selectedRecipientId) ?? null,
    [vipNodes, selectedRecipientId]
  );

  const creditsAfter = balance !== null ? balance - PITCH_COST : null;

  async function load(): Promise<void> {
    if (!getSessionToken()) { setMe(null); setLoading(false); return; }
    setLoading(true); setErrorLine(null);
    try {
      const meRes = await getJson<{ user: AuthUser }>("/v1/auth/me", { auth: true });
      setMe(meRes.user);

      const [graphRes, balRes] = await Promise.all([
        getJson<GraphResponse>("/v1/network/graph?limit=44", { auth: true }),
        getJson<CreditBalance>("/v1/credits/me", { auth: true }),
      ]);

      const vips = (graphRes.nodes ?? []).filter(n => n.type === "user" && n.isVip && n.targetUserId && n.targetUserId !== meRes.user.userId);
      setVipNodes(vips);
      setBalance(balRes.balance);
      if (vips.length > 0 && !selectedRecipientId) setSelectedRecipientId(vips[0].targetUserId!);

      if (meRes.user.isVip) {
        const inboxRes = await getJson<{ items: Pitch[] }>("/v1/pitches/inbox", { auth: true }).catch(() => ({ items: [] }));
        setInbox(inboxRes.items ?? []);
      }
    } catch (err) {
      setErrorLine(friendlyError(err, "Could not load pitch studio."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function sendPitch(): Promise<void> {
    if (!pitchTitle.trim() || !pitchSummary.trim() || !pitchAsk.trim() || !selectedRecipientId) {
      setErrorLine("Please fill in all required fields."); return;
    }
    setSubmitting(true); setErrorLine(null);
    try {
      await postJson("/v1/pitches", {
        recipientId: selectedRecipientId,
        title: pitchTitle.trim(),
        summary: pitchSummary.trim(),
        ask: pitchAsk.trim(),
        deckUrl: deckUrl.trim() || undefined,
      }, { auth: true });
      setPitchTitle(""); setPitchSummary(""); setPitchAsk(""); setDeckUrl("");
      setComposerOpen(false);
      setSuccessLine(`Pitch delivered — ${PITCH_COST} credits charged. You'll be notified when they respond.`);
      await load();
    } catch (err) {
      setErrorLine(friendlyError(err, "Could not send pitch."));
    } finally { setSubmitting(false); }
  }

  async function decide(pitchId: string, status: "accepted" | "declined"): Promise<void> {
    setDecidingId(pitchId); setErrorLine(null);
    const token = getSessionToken();
    if (!token) { setErrorLine("Sign in first."); setDecidingId(null); return; }
    try {
      const res = await fetch(`${apiBaseUrl}/v1/pitches/${pitchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      if (status === "accepted") {
        setSuccessLine(`Pitch accepted — you earned ${PITCH_REWARD} credits and a private thread is now open.`);
      } else {
        setSuccessLine("Pitch declined.");
      }
      await load();
    } catch (err) {
      setErrorLine(friendlyError(err, "Could not process decision."));
    } finally { setDecidingId(null); }
  }

  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 text-center">
        <p className="text-sm" style={{ color: G.muted }}>Loading Pitch Studio…</p>
      </section>
    );
  }

  // ── Not signed in ─────────────────────────────────────────────
  if (!me) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 sm:p-12">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-5"
          style={{ background: "rgba(123,94,167,0.18)", border: "1px solid rgba(123,94,167,0.38)", color: "#C4A8E8" }}>
          Pitch Studio
        </span>
        <h1 style={{ fontFamily: G.display, fontSize: "clamp(2.4rem,5vw,3.6rem)", color: G.champagne, lineHeight: 1.0 }}>
          Pitch directly<br />to those who decide.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: G.muted }}>
          Send a structured pitch to verified VIP members — investors, operators, and decision-makers in the Balearic ecosystem.
        </p>
        <a href="/workspace" className="btn-primary premium-button mt-7 inline-flex rounded-xl px-7 py-3 text-sm">
          Sign In to Continue
        </a>
      </section>
    );
  }

  // ── Signed in ─────────────────────────────────────────────────
  return (
    <div className="grid gap-5">

      {/* ── Hero Header ── */}
      <section className="surface-stage rounded-[1.8rem] p-6 sm:p-8">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-4"
          style={{ background: "rgba(123,94,167,0.18)", border: "1px solid rgba(123,94,167,0.38)", color: "#C4A8E8" }}>
          {isVip ? "VIP Inbox" : "Pitch Studio"}
        </span>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,3rem)", color: G.champagne, lineHeight: 1.0 }}>
              {isVip ? "Your private pitch inbox." : "Pitch to the inner circle."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: G.muted }}>
              {isVip
                ? `As a VIP member, you receive curated pitches directly. Accept to open a private thread and earn ${PITCH_REWARD} credits.`
                : `Send a structured, private pitch to any VIP member — investor, operator, or decision-maker. One pitch, one decision. No cold email.`}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {balance !== null && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(196,151,58,0.08)", border: "1px solid rgba(196,151,58,0.18)" }}>
                <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: G.muted }}>Your balance</p>
                <p style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne, lineHeight: 1 }}>
                  {balance} <span className="text-sm font-normal" style={{ color: G.muted }}>cr</span>
                </p>
              </div>
            )}
            {!isVip && (
              <button
                onClick={() => { setComposerOpen(o => !o); setErrorLine(null); setSuccessLine(null); }}
                className="btn-vip shrink-0 rounded-xl px-6 py-3 text-sm"
              >
                {composerOpen ? "✕ Close" : "+ New Pitch"}
              </button>
            )}
          </div>
        </div>

        {errorLine && <p className="mt-4 rounded-xl px-4 py-2.5 text-sm" style={{ background: "rgba(201,123,110,0.08)", border: "1px solid rgba(201,123,110,0.20)", color: "#E8A898" }}>{errorLine}</p>}
        {successLine && <p className="mt-4 rounded-xl px-4 py-2.5 text-sm" style={{ background: "rgba(74,124,89,0.08)", border: "1px solid rgba(74,124,89,0.22)", color: "#a0c890" }}>{successLine}</p>}
      </section>

      {/* ── How It Works (non-VIP, composer closed) ── */}
      {!isVip && !composerOpen && (
        <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.28em] mb-5" style={{ color: G.muted }}>How Pitches Work</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                num: "1",
                icon: "◎",
                title: "Choose a VIP member",
                text: `Select a verified VIP from the dropdown. Each pitch costs ${PITCH_COST} credits and goes directly into their private inbox — no intermediary, no filtering.`,
                color: "#C4A8E8",
                bg: "rgba(123,94,167,0.06)",
                border: "rgba(123,94,167,0.16)",
              },
              {
                num: "2",
                icon: "⬡",
                title: "They read your pitch",
                text: "The VIP member reads your title, summary, and specific ask on their own timeline. Your pitch stands on its own merits — clear, structured, direct.",
                color: G.gold,
                bg: "rgba(196,151,58,0.05)",
                border: "rgba(196,151,58,0.14)",
              },
              {
                num: "3",
                icon: "◈",
                title: "Accept → private chat",
                text: `If they accept, a private direct message thread opens automatically. The VIP earns ${PITCH_REWARD} credits for engaging — the network rewards quality connections.`,
                color: "#a0c890",
                bg: "rgba(74,124,89,0.06)",
                border: "rgba(74,124,89,0.16)",
              },
            ].map(s => (
              <div key={s.num} className="rounded-[1.2rem] p-5" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg" style={{ color: s.color }}>{s.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: s.color }}>Step {s.num}</span>
                </div>
                <p className="text-sm font-semibold mb-1.5" style={{ color: G.champagne }}>{s.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: G.muted }}>{s.text}</p>
              </div>
            ))}
          </div>

          {/* VIP Preview Cards */}
          {vipNodes.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-[0.20em] mb-3" style={{ color: G.muted }}>Available VIP Members</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {vipNodes.slice(0, 4).map(node => (
                  <div key={node.id} className="flex items-center gap-3 rounded-xl p-3"
                    style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.12)" }}>
                    <VipAvatar node={node} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: G.champagne }}>{displayLabel(node)}</p>
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{ background: "rgba(196,151,58,0.15)", color: G.gold, border: "1px solid rgba(196,151,58,0.25)" }}>
                          VIP
                        </span>
                      </div>
                      {node.industry && <p className="text-xs truncate mt-0.5" style={{ color: G.muted }}>{node.industry.replace(/_/g, " ")}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vipNodes.length === 0 && (
            <div className="mt-5 rounded-xl p-4 text-center" style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.10)" }}>
              <p className="text-sm" style={{ color: G.muted }}>No VIP members in the network yet. Once VIP members join, you can pitch them directly here.</p>
            </div>
          )}
        </section>
      )}

      {/* ── Pitch Composer ── */}
      {composerOpen && !isVip && (
        <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: G.muted }}>Compose Pitch</p>
          <h2 style={{ fontFamily: G.display, fontSize: "1.8rem", color: G.champagne, marginTop: "0.25rem" }}>
            Write your pitch
          </h2>

          <div className="mt-6 grid gap-5">
            {/* Recipient selector */}
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Pitch to <span style={{ color: "var(--danger)" }}>*</span>
              </p>
              {vipNodes.length === 0 ? (
                <div className="rounded-xl p-4" style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.14)" }}>
                  <p className="text-sm" style={{ color: G.muted }}>No VIP members available yet. Check back when more members join.</p>
                </div>
              ) : (
                <>
                  <select
                    value={selectedRecipientId}
                    onChange={e => setSelectedRecipientId(e.target.value)}
                    className="field-control"
                  >
                    {vipNodes.map(n => (
                      <option key={n.targetUserId} value={n.targetUserId!}>
                        {displayLabel(n)}{n.industry ? ` · ${n.industry.replace(/_/g, " ")}` : ""}
                      </option>
                    ))}
                  </select>

                  {selectedVip && (
                    <div className="mt-3 flex items-start gap-3 rounded-xl p-3"
                      style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.18)" }}>
                      <VipAvatar node={selectedVip} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold" style={{ color: G.champagne }}>{displayLabel(selectedVip)}</p>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={{ background: "rgba(196,151,58,0.15)", color: G.gold, border: "1px solid rgba(196,151,58,0.25)" }}>
                            VIP
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: G.muted }}>{selectedVip.summary}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Pitch Title <span style={{ color: "var(--danger)" }}>*</span>
              </p>
              <input
                value={pitchTitle}
                onChange={e => setPitchTitle(e.target.value)}
                placeholder="What is this pitch about? Be specific."
                className="field-control"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Summary <span style={{ color: "var(--danger)" }}>*</span>
              </p>
              <textarea
                value={pitchSummary}
                onChange={e => setPitchSummary(e.target.value)}
                rows={4}
                placeholder="Describe your business, track record, and why you're reaching out to this person specifically. Be clear and compelling."
                className="field-control text-sm"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Your Ask <span style={{ color: "var(--danger)" }}>*</span>
              </p>
              <textarea
                value={pitchAsk}
                onChange={e => setPitchAsk(e.target.value)}
                rows={2}
                placeholder="What exactly are you asking for? A meeting, investment, partnership, introduction?"
                className="field-control text-sm"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Deck or Materials URL <span className="ml-1 opacity-60">(optional)</span>
              </p>
              <input
                value={deckUrl}
                onChange={e => setDeckUrl(e.target.value)}
                placeholder="https://drive.google.com/… or similar"
                className="field-control"
              />
            </div>

            {/* Credit cost preview */}
            <div className="rounded-xl p-4" style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.18)" }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Cost of this pitch</p>
                  <p style={{ fontFamily: G.display, fontSize: "1.8rem", color: G.champagne, lineHeight: 1.1 }}>
                    {PITCH_COST} <span className="text-sm font-normal" style={{ color: G.muted }}>credits</span>
                  </p>
                </div>
                {balance !== null && (
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>After sending</p>
                    <p style={{ fontFamily: G.display, fontSize: "1.8rem", lineHeight: 1.1,
                      color: (creditsAfter ?? 0) < 0 ? "var(--danger)" : G.champagne }}>
                      {creditsAfter} <span className="text-sm font-normal" style={{ color: G.muted }}>credits left</span>
                    </p>
                  </div>
                )}
              </div>
              {(creditsAfter ?? 0) < 0 && (
                <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                  Not enough credits — <a href="/credits" style={{ color: G.gold, textDecoration: "underline" }}>top up here</a>.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => void sendPitch()}
                disabled={submitting || vipNodes.length === 0 || (creditsAfter ?? 0) < 0}
                className="btn-vip rounded-xl px-7 py-3 text-sm disabled:opacity-50"
              >
                {submitting ? "Sending pitch…" : `Send Pitch — ${PITCH_COST} cr`}
              </button>
              <button onClick={() => setComposerOpen(false)} className="btn-quiet rounded-xl px-5 py-3 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── VIP Inbox ── */}
      {isVip && (
        <section className="grid gap-3">
          <div className="surface-elevated rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>Inbox</p>
                <h2 style={{ fontFamily: G.display, fontSize: "1.8rem", color: G.champagne, marginTop: "0.15rem" }}>
                  Received pitches
                </h2>
              </div>
              {inbox.length > 0 && (
                <div className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "rgba(123,94,167,0.18)", border: "1px solid rgba(123,94,167,0.30)", color: "#C4A8E8" }}>
                  {inbox.filter(p => p.status === "pending").length} pending
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl p-3 text-xs" style={{ background: "rgba(212,168,74,0.06)", border: "1px solid rgba(212,168,74,0.15)" }}>
              <span style={{ color: G.gold }}>⬡ VIP perk: </span>
              <span style={{ color: G.muted }}>Accept a pitch to open a private thread and earn {PITCH_REWARD} credits. Decline to dismiss without notification.</span>
            </div>

            <div className="grid gap-3">
              {inbox.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-2xl mb-2" style={{ fontFamily: G.display, color: "rgba(237,229,208,0.25)" }}>◎</p>
                  <p className="text-sm" style={{ color: G.muted }}>Your inbox is empty. Pitches from members will appear here.</p>
                </div>
              )}
              {inbox.map(pitch => {
                const sc = statusColors[pitch.status] ?? statusColors.pending;
                return (
                  <div key={pitch.id} className="rounded-[1.2rem] p-5"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(196,151,58,0.10)" }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-base font-semibold" style={{ color: G.champagne }}>{pitch.title}</h3>
                        {pitch.senderCompany && (
                          <p className="text-xs mt-0.5" style={{ color: G.muted }}>from {pitch.senderCompany}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] uppercase font-semibold tracking-[0.12em]"
                          style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                          {pitch.status}
                        </span>
                        <span className="text-xs hidden sm:block" style={{ color: "rgba(154,144,128,0.50)" }}>{isoDate(pitch.createdAt)}</span>
                      </div>
                    </div>

                    <p className="text-sm leading-relaxed mb-3" style={{ color: "rgba(237,229,208,0.76)" }}>{pitch.summary}</p>

                    <div className="rounded-xl p-3" style={{ background: "rgba(123,94,167,0.06)", border: "1px solid rgba(123,94,167,0.14)" }}>
                      <p className="text-[10px] uppercase tracking-[0.12em] mb-1" style={{ color: "rgba(196,168,232,0.55)" }}>Their Ask</p>
                      <p className="text-sm" style={{ color: "rgba(237,229,208,0.80)" }}>{pitch.ask}</p>
                    </div>

                    {pitch.status === "pending" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => void decide(pitch.id, "accepted")}
                          disabled={decidingId === pitch.id}
                          className="btn-primary premium-button rounded-xl px-6 py-2 text-xs disabled:opacity-50"
                        >
                          {decidingId === pitch.id ? "…" : `Accept  +${PITCH_REWARD} cr`}
                        </button>
                        <button
                          onClick={() => void decide(pitch.id, "declined")}
                          disabled={decidingId === pitch.id}
                          className="btn-quiet rounded-xl px-5 py-2 text-xs"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
