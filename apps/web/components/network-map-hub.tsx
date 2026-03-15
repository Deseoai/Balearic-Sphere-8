"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getJson, getSessionToken, postJson } from "../lib/api";
import { useLang } from "../lib/i18n";

type AuthUser = { userId: string; email: string; displayName?: string; accessLevel: string; isVip?: boolean; };
type GraphNode = {
  id: string; type: "user" | "listing" | "ai" | "circle";
  label: string; company?: string; summary: string; heat: number;
  x: number; y: number; status?: string; category?: string;
  targetUserId?: string; targetEmail?: string;
  industry?: string; website?: string; annualRevenue?: string;
  verification?: "none" | "pending" | "verified" | "rejected";
  trustScore?: number; isVip?: boolean; avatarUrl?: string;
};
type GraphEdge = { id: string; source: string; target: string; relation: "core" | "opportunity" | "insight" | "access"; strength: number; };
type GraphResponse = { nodes: GraphNode[]; edges: GraphEdge[]; };
type CreditPackage = { id: "starter" | "growth" | "circle"; label: string; credits: number; priceEur: number; };
type PackagesResponse = { currency: string; items: CreditPackage[]; };

const INTRO_UNLOCK_COST = 15;
const INTRO_UNLOCK_COST_VIP = 30;
const LIVE_POLL_MS = 8000;

const G = {
  gold:      "var(--gold)",
  champagne: "var(--champagne)",
  muted:     "var(--text-secondary)",
  display:   "var(--font-display)",
};

// Full industry + category color palette
const INDUSTRY_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  technology:    { bg: "#0d1520", border: "#4A9EF5", glow: "rgba(74,158,245,0.55)" },
  real_estate:   { bg: "#0f1a0d", border: "#6CB96B", glow: "rgba(108,185,107,0.55)" },
  hospitality:   { bg: "#1a0f0d", border: "#E8856A", glow: "rgba(232,133,106,0.55)" },
  finance:       { bg: "#1a1408", border: "#D4A84A", glow: "rgba(212,168,74,0.55)" },
  investment:    { bg: "#14100a", border: "#E8C060", glow: "rgba(232,192,96,0.55)" },
  fashion:       { bg: "#1a0d14", border: "#E87AB0", glow: "rgba(232,122,176,0.55)" },
  yachting:      { bg: "#0d1520", border: "#50B8E8", glow: "rgba(80,184,232,0.55)" },
  arts:          { bg: "#14081a", border: "#C070E0", glow: "rgba(192,112,224,0.55)" },
  wellness:      { bg: "#0d1a18", border: "#4DC4A8", glow: "rgba(77,196,168,0.55)" },
  consulting:    { bg: "#0d1218", border: "#78A0C0", glow: "rgba(120,160,192,0.50)" },
  legal:         { bg: "#18140d", border: "#C8A060", glow: "rgba(200,160,96,0.50)" },
  media:         { bg: "#180c00", border: "#FF8C42", glow: "rgba(255,140,66,0.55)" },
  food_beverage: { bg: "#18100a", border: "#E8A060", glow: "rgba(232,160,96,0.50)" },
  events:        { bg: "#0d1418", border: "#60C8E8", glow: "rgba(96,200,232,0.50)" },
  // Applicant category fallbacks
  investor:      { bg: "#1a1408", border: "#C4973A", glow: "rgba(196,151,58,0.55)" },
  founder:       { bg: "#0d1a14", border: "#4CAF7D", glow: "rgba(76,175,125,0.55)" },
  creator:       { bg: "#150d1a", border: "#9B59B6", glow: "rgba(155,89,182,0.55)" },
  service:       { bg: "#0d1318", border: "#3498DB", glow: "rgba(52,152,219,0.55)" },
  advisor:       { bg: "#121218", border: "#78909C", glow: "rgba(120,144,156,0.50)" },
  other:         { bg: "#141210", border: "#8A8070", glow: "rgba(138,128,112,0.40)" },
};
const VIP_PALETTE = { bg: "#1a1408", border: "#D4A84A", glow: "rgba(212,168,74,0.70)" };

function nodePalette(node: GraphNode): { bg: string; border: string; glow: string } {
  if (node.isVip) return VIP_PALETTE;
  const key = node.industry ?? node.category ?? "other";
  return INDUSTRY_COLORS[key] ?? INDUSTRY_COLORS.other!;
}

function nodeSize(node: GraphNode, isSelected: boolean): number {
  const base = 11 + node.heat / 8;
  return isSelected ? base * 1.5 : base;
}

function displayName(node: GraphNode): string {
  return node.company || node.label || "Member";
}

function parseInsufficientCredits(error: unknown): { required: number; balance: number; isVipTarget?: boolean } | null {
  if (!(error instanceof Error) || !error.message) return null;
  try {
    const p = JSON.parse(error.message) as { error?: string; required?: number; balance?: number; isVipTarget?: boolean };
    if (p.error === "insufficient_credits") return { required: p.required ?? INTRO_UNLOCK_COST, balance: p.balance ?? 0, isVipTarget: p.isVipTarget };
  } catch { /* */ }
  return null;
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message.trim();
  try {
    const p = JSON.parse(raw) as { error?: string; message?: string };
    if (p.error === "missing_session_token" || p.error === "invalid_or_expired_session") return "Please sign in from Workspace first.";
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  return raw.slice(0, 220);
}

// Animated particle traveling along an edge
function EdgeParticle({ srcX, srcY, tgtX, tgtY, color, delay, duration }: {
  srcX: number; srcY: number; tgtX: number; tgtY: number;
  color: string; delay: number; duration: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: 5, height: 5, background: color, boxShadow: `0 0 8px ${color}`, transform: "translate(-50%, -50%)", zIndex: 2 }}
      animate={{ left: [`${srcX}%`, `${tgtX}%`], top: [`${srcY}%`, `${tgtY}%`], opacity: [0, 0.9, 0.9, 0] }}
      transition={{ repeat: Infinity, duration, delay, ease: "linear" }}
    />
  );
}

export function NetworkMapHub() {
  const { t } = useLang();
  const router = useRouter();

  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState(false);
  const [topupBusy, setTopupBusy]     = useState(false);
  const [me, setMe]                   = useState<AuthUser | null>(null);
  const [nodes, setNodes]             = useState<GraphNode[]>([]);
  const [edges, setEdges]             = useState<GraphEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [fullscreen, setFullscreen]   = useState(false);
  const [liveMode, setLiveMode]       = useState(true);
  const [statusLine, setStatusLine]   = useState("Loading your private network…");
  const [errorLine, setErrorLine]     = useState<string | null>(null);
  const [introNote, setIntroNote]     = useState("I came across your business and believe there is a meaningful opportunity worth exploring together.");

  const [packages, setPackages]       = useState<CreditPackage[]>([]);
  const [topupOpen, setTopupOpen]     = useState(false);
  const [topupRequired, setTopupRequired] = useState(INTRO_UNLOCK_COST);
  const [topupBalance, setTopupBalance]   = useState(0);
  const [topupIsVip, setTopupIsVip]       = useState(false);
  const [detailOpen, setDetailOpen]   = useState(false);

  // VIP Easter Egg: Founders' Vault
  const [vaultOpen, setVaultOpen]     = useState(false);
  const [vaultClickCount, setVaultClickCount] = useState(0);

  // Intro history: track who the current user has previously contacted
  const [sentIntros, setSentIntros]   = useState<Set<string>>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem("bs_sent_intros") : null;
      return new Set(s ? (JSON.parse(s) as string[]) : []);
    } catch { return new Set<string>(); }
  });

  const memberNodes = useMemo(() => nodes.filter(n => n.type === "user"), [nodes]);
  const memberEdges = useMemo(() => {
    const ids = new Set(memberNodes.map(n => n.id));
    return edges.filter(e => ids.has(e.source) && ids.has(e.target));
  }, [edges, memberNodes]);

  const selectedNode = useMemo(() => memberNodes.find(n => n.id === selectedNodeId) ?? null, [memberNodes, selectedNodeId]);

  const unlockableNode: GraphNode | null =
    selectedNode?.type === "user" && !!selectedNode.targetUserId && !!selectedNode.targetEmail && selectedNode.targetUserId !== me?.userId
      ? selectedNode : null;

  const introCost = unlockableNode?.isVip ? INTRO_UNLOCK_COST_VIP : INTRO_UNLOCK_COST;
  const shortfall = Math.max(0, topupRequired - topupBalance);

  const smallestSufficient = useMemo(() => {
    if (!packages.length) return null;
    return packages.find(p => p.credits >= shortfall) ?? packages[packages.length - 1];
  }, [packages, shortfall]);

  const recommendedTopup = useMemo(() => {
    if (!packages.length) return null;
    const desired = Math.max(topupRequired, Math.ceil(shortfall * 1.8));
    return packages.find(p => p.credits >= desired) ?? packages[packages.length - 1];
  }, [packages, shortfall, topupRequired]);

  // Dynamic legend: unique industries/categories present in current nodes
  const presentIndustries = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const n of memberNodes) {
      if (n.isVip && !seen.has("vip")) seen.set("vip", { label: "VIP", color: VIP_PALETTE.border });
      const key = n.industry ?? n.category;
      if (key && !seen.has(key)) {
        const palette = INDUSTRY_COLORS[key] ?? INDUSTRY_COLORS.other!;
        seen.set(key, { label: key.replaceAll("_", " "), color: palette.border });
      }
    }
    return [...seen.entries()].slice(0, 7);
  }, [memberNodes]);

  async function loadPackages(): Promise<void> {
    if (packages.length > 0) return;
    try { const r = await getJson<PackagesResponse>("/v1/credits/packages"); setPackages(r.items ?? []); } catch { /* */ }
  }

  async function refreshGraph(options?: { silent?: boolean }): Promise<void> {
    if (!getSessionToken()) {
      setMe(null); setNodes([]); setEdges([]); setSelectedNodeId(null);
      setStatusLine("Sign in from Workspace to view your private network."); setErrorLine(null); setLoading(false); return;
    }
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [meRes, graphRes] = await Promise.all([
        getJson<{ user: AuthUser }>("/v1/auth/me", { auth: true }),
        getJson<GraphResponse>("/v1/network/graph?limit=44", { auth: true }),
      ]);
      setMe(meRes.user);
      const allNodes = graphRes.nodes ?? [];
      const userOnly = allNodes.filter(n => n.type === "user");
      setNodes(allNodes);
      setEdges(graphRes.edges ?? []);
      setSelectedNodeId(c => c ?? userOnly.find(n => n.id !== `user:${meRes.user.userId}`)?.id ?? userOnly[0]?.id ?? null);
      setStatusLine(`Updated — ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
      setErrorLine(null);
    } catch (error) {
      setMe(null); setNodes([]); setEdges([]); setSelectedNodeId(null);
      setErrorLine(friendlyError(error, "Could not load your network."));
      setStatusLine("Network unavailable.");
    } finally { if (!silent) setLoading(false); }
  }

  async function unlockContact(options?: { retryAfterTopup?: boolean }): Promise<void> {
    if (!unlockableNode) return;
    setBusy(true); setErrorLine(null);
    try {
      const response = await postJson<{ status: string; chargedCredits: number; chatThreadId?: string | null }>(
        "/v1/network/intros",
        { targetNodeId: unlockableNode.id, targetLabel: displayName(unlockableNode), message: introNote.trim(), targetUserId: unlockableNode.targetUserId, targetEmail: unlockableNode.targetEmail, autoOpenChat: true },
        { auth: true }
      );
      // Save to intro history
      if (unlockableNode.targetUserId) {
        const next = new Set(sentIntros);
        next.add(unlockableNode.targetUserId);
        setSentIntros(next);
        try { localStorage.setItem("bs_sent_intros", JSON.stringify([...next])); } catch { /* */ }
      }
      if (response.chatThreadId) { router.push(`/messages?thread=${encodeURIComponent(response.chatThreadId)}`); return; }
      setStatusLine(`Introduction sent (${response.chargedCredits} credits). Open Messages to continue.`);
    } catch (error) {
      const credits = parseInsufficientCredits(error);
      if (credits && !options?.retryAfterTopup) {
        setTopupRequired(credits.required); setTopupBalance(credits.balance); setTopupIsVip(credits.isVipTarget ?? false);
        setTopupOpen(true); await loadPackages(); setStatusLine("A small top-up is needed to continue."); return;
      }
      setErrorLine(friendlyError(error, "Could not send this introduction."));
    } finally { setBusy(false); }
  }

  async function buyTopup(packageId: CreditPackage["id"]): Promise<void> {
    setTopupBusy(true); setErrorLine(null);
    try {
      await postJson("/v1/credits/purchase", { packageId }, { auth: true });
      setTopupOpen(false);
      await unlockContact({ retryAfterTopup: true });
      await refreshGraph({ silent: true });
    } catch (error) { setErrorLine(friendlyError(error, "Top-up could not be completed.")); }
    finally { setTopupBusy(false); }
  }

  useEffect(() => { void refreshGraph(); }, []);

  useEffect(() => {
    if (!liveMode || !me) return;
    const timer = window.setInterval(() => void refreshGraph({ silent: true }), LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [liveMode, me?.userId]);

  // Top edges for particle animation (only strongest connections)
  const particleEdges = useMemo(() =>
    [...memberEdges].sort((a, b) => b.strength - a.strength).slice(0, 8),
  [memberEdges]);

  /* ── Map Scene ─────────────────────────────────────────────────── */
  const mapScene = (heightClass: string) => (
    <div
      className={`${heightClass} overflow-hidden rounded-2xl relative`}
      style={{
        background: [
          "radial-gradient(ellipse at 20% 20%, rgba(74,158,245,0.05) 0%, transparent 45%)",
          "radial-gradient(ellipse at 75% 15%, rgba(196,151,58,0.06) 0%, transparent 40%)",
          "radial-gradient(ellipse at 50% 80%, rgba(76,175,125,0.04) 0%, transparent 45%)",
          "radial-gradient(ellipse at 85% 65%, rgba(155,89,182,0.04) 0%, transparent 40%)",
          "#080706"
        ].join(", "),
        border: "1px solid rgba(196,151,58,0.12)",
      }}
    >
      {/* Grid dots */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(196,151,58,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* VIP Easter Egg: hidden constellation — only visible to VIP users */}
      {me?.isVip && (
        <button
          className="absolute z-10 pointer-events-auto"
          style={{ top: "6%", right: "4%", opacity: 0.12, cursor: "pointer" }}
          onClick={() => {
            const next = vaultClickCount + 1;
            setVaultClickCount(next);
            if (next >= 1) { setVaultOpen(true); setVaultClickCount(0); }
          }}
          title="✦"
        >
          <motion.span
            animate={{ opacity: [0.12, 0.35, 0.12], scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            style={{ display: "block", fontSize: "22px", color: "#D4A84A" }}
          >
            ✦
          </motion.span>
        </button>
      )}

      {/* SVG edges */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <filter id="glow-edge">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {memberEdges.map(edge => {
          const src = memberNodes.find(n => n.id === edge.source);
          const tgt = memberNodes.find(n => n.id === edge.target);
          if (!src || !tgt) return null;
          const isActive = selectedNodeId === edge.source || selectedNodeId === edge.target;
          const color = isActive ? "rgba(212,168,74,0.55)" : "rgba(196,151,58,0.14)";
          return (
            <line
              key={edge.id}
              x1={`${src.x}%`} y1={`${src.y}%`}
              x2={`${tgt.x}%`} y2={`${tgt.y}%`}
              stroke={color}
              strokeWidth={isActive ? Math.max(0.8, edge.strength / 80) : Math.max(0.4, edge.strength / 160)}
              strokeDasharray={isActive ? undefined : "3 6"}
              filter={isActive ? "url(#glow-edge)" : undefined}
            />
          );
        })}
      </svg>

      {/* Animated particles along strong edges */}
      {particleEdges.map((edge, i) => {
        const src = memberNodes.find(n => n.id === edge.source);
        const tgt = memberNodes.find(n => n.id === edge.target);
        if (!src || !tgt) return null;
        const palette = nodePalette(src);
        return (
          <EdgeParticle
            key={`p-${edge.id}`}
            srcX={src.x} srcY={src.y}
            tgtX={tgt.x} tgtY={tgt.y}
            color={palette.border}
            delay={(i * 0.6) % 4}
            duration={3.5 + (i % 6) * 0.5}
          />
        );
      })}

      {/* Nodes */}
      {memberNodes.map((node, i) => {
        const isSelected = selectedNodeId === node.id;
        const isMe = node.targetUserId === me?.userId;
        const palette = isMe ? VIP_PALETTE : nodePalette(node);
        const size = nodeSize(node, isSelected);
        const hasPreviousContact = node.targetUserId ? sentIntros.has(node.targetUserId) : false;

        return (
          <motion.button
            key={node.id}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{
              opacity: 1,
              scale: isSelected ? 1.0 : 1.0,
              y: isSelected ? 0 : [0, -(1.5 + (i % 3)), 0],
            }}
            transition={{
              opacity: { delay: i * 0.025, duration: 0.3 },
              scale: { delay: i * 0.025, duration: 0.3 },
              y: { repeat: Infinity, duration: 3.5 + (i % 4), ease: "easeInOut", delay: i * 0.15 }
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: isSelected ? 10 : 3 }}
            onClick={() => {
              setSelectedNodeId(node.id);
              setDetailOpen(true);
              if (node.isVip && node.targetUserId) {
                postJson(`/v1/network/profile-view/${node.targetUserId}`, {}, { auth: true }).catch(() => {});
              }
            }}
            title={displayName(node)}
          >
            {/* VIP breathing ring */}
            {(node.isVip || isMe) && (
              <motion.span
                className="absolute rounded-full pointer-events-none"
                animate={{ opacity: [0.45, 0.90, 0.45], scale: [1, 1.18, 1] }}
                transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut", delay: i * 0.1 }}
                style={{ inset: "-7px", border: `1.5px solid ${palette.border}70`, borderRadius: "50%", boxShadow: `0 0 20px ${palette.glow}` }}
              />
            )}

            {/* Selected pulse ring */}
            {isSelected && (
              <motion.span
                className="absolute rounded-full pointer-events-none"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                style={{ inset: "-8px", border: `1px solid ${palette.border}`, borderRadius: "50%" }}
              />
            )}

            {/* Node circle — gradient fill */}
            <span
              className="block rounded-full transition-shadow"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                background: isSelected || isMe
                  ? `radial-gradient(circle at 38% 32%, ${palette.border}FF, ${palette.border}BB, ${palette.bg})`
                  : `radial-gradient(circle at 38% 32%, ${palette.border}CC, ${palette.border}66, ${palette.bg})`,
                boxShadow: isSelected
                  ? `0 0 0 2.5px ${palette.glow}, 0 0 28px ${palette.glow}, 0 0 56px ${palette.glow}60`
                  : `0 0 0 1px ${palette.glow}, 0 0 10px ${palette.glow}`,
                border: `1px solid ${palette.border}55`,
              }}
            />

            {/* Previously contacted indicator */}
            {hasPreviousContact && !isMe && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px]"
                style={{ background: "#4CAF7D", border: "1px solid #0d1a14", zIndex: 11 }}
              >
                ✓
              </span>
            )}

            {/* Label on selection */}
            {isSelected && (
              <span
                className="absolute pointer-events-none"
                style={{ bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", zIndex: 12 }}
              >
                <motion.span
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="block rounded-full px-2.5 py-0.5 text-[9px]"
                  style={{
                    background: isMe ? "rgba(212,168,74,0.95)" : "rgba(12,11,9,0.96)",
                    color: isMe ? "#0C0B09" : "var(--champagne)",
                    fontWeight: 700, letterSpacing: "0.04em",
                    border: `1px solid ${palette.border}55`,
                    boxShadow: `0 2px 10px rgba(0,0,0,0.50), 0 0 0 1px ${palette.glow}`,
                  }}
                >
                  {node.company || node.industry?.replaceAll("_", " ") || "Member"}
                </motion.span>
              </span>
            )}
          </motion.button>
        );
      })}

      {/* Fullscreen toggle button */}
      <button
        onClick={() => setFullscreen(v => !v)}
        className="absolute bottom-3 right-3 z-20 rounded-xl px-3 py-1.5 text-xs transition-colors"
        style={{ background: "rgba(14,13,11,0.88)", border: "1px solid rgba(196,151,58,0.22)", color: "var(--text-secondary)", backdropFilter: "blur(8px)" }}
      >
        {fullscreen ? `⊠ ${t("networkMap.exitFullscreen")}` : `⊡ ${t("networkMap.fullscreen")}`}
      </button>

      {/* Node count + live indicator */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        {liveMode && (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px]"
            style={{ background: "rgba(14,13,11,0.88)", border: "1px solid rgba(76,175,125,0.30)", color: "#4CAF7D", backdropFilter: "blur(8px)" }}>
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
            Live
          </span>
        )}
        <span className="rounded-full px-2.5 py-1 text-[9px]"
          style={{ background: "rgba(14,13,11,0.88)", border: "1px solid rgba(196,151,58,0.16)", color: "var(--text-secondary)", backdropFilter: "blur(8px)" }}>
          {memberNodes.length} members
        </span>
      </div>
    </div>
  );

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 text-center">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          <p className="text-sm" style={{ color: G.muted }}>{t("networkMap.loadingGraph")}</p>
        </motion.div>
      </section>
    );
  }

  /* ── Not signed in ───────────────────────────────────────────── */
  if (!me) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-7 sm:p-9">
        <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>Network</p>
        <h1 className="mt-3" style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,2.8rem)", color: G.champagne }}>Your private business network</h1>
        <p className="mt-2 max-w-xl text-sm" style={{ color: G.muted }}>{t("networkMap.signInPrompt")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/workspace" className="btn-primary premium-button rounded-xl px-6 py-2.5 text-sm">Open Workspace</Link>
          <a href="mailto:management@balea-sphere8.com" className="btn-quiet rounded-xl px-5 py-2.5 text-sm">Contact Support</a>
        </div>
      </section>
    );
  }

  /* ── Main View ───────────────────────────────────────────────── */
  return (
    <div className="grid gap-4">
      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>Private Network</p>
            <h1 className="mt-2 leading-tight" style={{ fontFamily: G.display, fontSize: "clamp(1.8rem,4vw,2.4rem)", color: G.champagne }}>
              Your circle of trusted businesses
            </h1>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: G.muted }}>
              Select a member to see their profile and send a private introduction.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setLiveMode(v => !v)}
              className="rounded-full px-3 py-1.5 text-xs transition-colors"
              style={{ border: "1px solid rgba(196,151,58,0.25)", background: liveMode ? "rgba(196,151,58,0.10)" : "transparent", color: liveMode ? G.champagne : G.muted }}
            >
              {liveMode ? "● Live" : "○ Live"}
            </button>
            <button onClick={() => void refreshGraph()} className="btn-quiet rounded-full px-3 py-1.5 text-xs">{t("common.refresh")}</button>
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: G.muted }}>{statusLine}</p>
        {errorLine && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errorLine}</p>}

        {/* Dynamic legend */}
        {presentIndustries.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {presentIndustries.map(([key, { label, color }]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                <span className="text-[10px] capitalize" style={{ color: "var(--text-secondary)" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Map + Panel */}
      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        {/* Map */}
        <article className="surface-elevated rounded-[1.5rem] p-4">
          <div className="sm:hidden">{mapScene("h-[260px] min-h-[260px]")}</div>
          <div className="hidden sm:block">{mapScene("h-[64vh] min-h-[500px]")}</div>
        </article>

        {/* Contact panel */}
        <article className="surface-elevated rounded-[1.5rem] p-5">
          {!selectedNode && (
            <div>
              <h2 style={{ fontFamily: G.display, fontSize: "1.8rem", color: G.champagne }}>Select a member</h2>
              <p className="mt-3 text-sm" style={{ color: G.muted }}>
                Click any node on the map to view a member&apos;s business profile and send a private introduction.
              </p>
              <div className="mt-5 rounded-xl p-4 text-sm" style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.10)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: G.champagne }}>How it works</p>
                <ol className="space-y-1.5 text-xs" style={{ color: G.muted }}>
                  <li>1. Select a business node in the map</li>
                  <li>2. Review their profile in this panel</li>
                  <li>3. Send an introduction — a chat opens immediately</li>
                </ol>
              </div>
              {sentIntros.size > 0 && (
                <p className="mt-4 text-[10px]" style={{ color: G.muted }}>
                  <span className="inline-block h-3 w-3 rounded-full text-center" style={{ background: "#4CAF7D", fontSize: "8px", lineHeight: "12px" }}>✓</span>
                  {" "}Green badge = previously contacted
                </p>
              )}
            </div>
          )}

          {selectedNode && (
            <div className="space-y-4">
              <div>
                {selectedNode.avatarUrl && (
                  <img src={selectedNode.avatarUrl} alt={displayName(selectedNode)}
                    className="mb-3 h-14 w-14 rounded-full object-cover"
                    style={{ border: "2px solid rgba(196,151,58,0.35)" }} />
                )}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {selectedNode.isVip && (
                    <span className="rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-[0.20em] font-bold"
                      style={{ background: "rgba(212,168,74,0.15)", border: "1px solid rgba(212,168,74,0.45)", color: "#D4A84A" }}>VIP</span>
                  )}
                  {selectedNode.verification === "verified" && (
                    <span className="status-chip status-accepted text-[9px]">{t("networkMap.verified")}</span>
                  )}
                  {selectedNode.targetUserId && sentIntros.has(selectedNode.targetUserId) && (
                    <span className="rounded-full px-2.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "rgba(76,175,125,0.12)", border: "1px solid rgba(76,175,125,0.30)", color: "#4CAF7D" }}>
                      {t("networkMap.introSent")}
                    </span>
                  )}
                </div>
                <h2 style={{ fontFamily: G.display, fontSize: "1.7rem", color: G.champagne, lineHeight: 1.15 }}>
                  {displayName(selectedNode)}
                </h2>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selectedNode.industry && (
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.10em]"
                      style={{ background: `${nodePalette(selectedNode).border}18`, border: `1px solid ${nodePalette(selectedNode).border}30`, color: nodePalette(selectedNode).border }}>
                      {selectedNode.industry.replaceAll("_", " ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "rgba(255,248,235,0.018)", border: "1px solid rgba(196,151,58,0.09)" }}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(237,229,208,0.78)" }}>
                  {selectedNode.summary || "No additional details available."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3 text-center" style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.11)" }}>
                  <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: G.muted }}>Signal</p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: G.champagne }}>{selectedNode.heat}</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.11)" }}>
                  <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: G.muted }}>Status</p>
                  <p className="mt-1 text-sm font-semibold capitalize" style={{ color: G.champagne }}>
                    {selectedNode.verification === "verified" ? "Verified" : selectedNode.verification === "pending" ? "Pending" : "Active"}
                  </p>
                </div>
              </div>

              <button onClick={() => setDetailOpen(true)} className="btn-quiet w-full rounded-xl px-4 py-2.5 text-sm">
                {t("networkMap.viewProfile")}
              </button>

              {unlockableNode && (
                <>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.16em]" style={{ color: G.muted }}>Your Introduction</p>
                    <textarea
                      value={introNote} onChange={e => setIntroNote(e.target.value)}
                      rows={4} className="field-control text-sm"
                      placeholder="Write a short, personal note to this business…"
                    />
                    {selectedNode.isVip && (
                      <p className="mt-1.5 text-[10px] rounded-lg px-3 py-1.5"
                        style={{ background: "rgba(212,168,74,0.07)", border: "1px solid rgba(212,168,74,0.20)", color: "rgba(212,168,74,0.80)" }}>
                        VIP member — introduction costs {INTRO_UNLOCK_COST_VIP} credits
                      </p>
                    )}
                  </div>
                  <button onClick={() => void unlockContact()} disabled={busy}
                    className="btn-primary premium-button w-full rounded-xl px-4 py-3 text-sm disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #9E7428, #C4973A, #D4A84A)" }}>
                    {busy ? t("networkMap.introSending") : `${t("networkMap.sendIntro")} — ${introCost} credits`}
                  </button>
                </>
              )}

              {selectedNode.type === "user" && !unlockableNode && (
                <p className="text-xs" style={{ color: G.muted }}>
                  {selectedNode.targetUserId === me?.userId ? "This is your own profile." : "This member cannot be contacted directly at this time."}
                </p>
              )}
            </div>
          )}
        </article>
      </section>

      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[45] p-3 sm:p-4"
            style={{ background: "rgba(8,7,6,0.96)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: G.champagne }}>{t("networkMap.fullscreen")}</p>
                <div className="flex gap-2">
                  <button onClick={() => void refreshGraph()} className="btn-quiet rounded-full px-3 py-1 text-xs">{t("common.refresh")}</button>
                  <button onClick={() => setFullscreen(false)} className="btn-quiet rounded-full px-3 py-1 text-xs">{t("common.close")} ✕</button>
                </div>
              </div>
              <div className="flex-1 min-h-0">{mapScene("h-full")}</div>
              {selectedNode && (
                <div className="shrink-0 rounded-xl p-4" style={{ background: "rgba(14,13,11,0.95)", border: "1px solid rgba(196,151,58,0.16)" }}>
                  <div className="flex items-center gap-3">
                    {selectedNode.avatarUrl && <img src={selectedNode.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: G.champagne }}>{displayName(selectedNode)}</p>
                      <p className="text-xs truncate" style={{ color: G.muted }}>{selectedNode.industry?.replaceAll("_", " ") ?? ""}</p>
                    </div>
                    <button onClick={() => { setFullscreen(false); setDetailOpen(true); }} className="btn-quiet rounded-xl px-3 py-1.5 text-xs shrink-0">
                      {t("networkMap.viewProfile")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Member Detail Panel */}
      <AnimatePresence>
        {detailOpen && selectedNode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="sheet-backdrop fixed inset-0 z-[55] flex items-center justify-center p-4">
            <motion.section
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="surface-elevated w-full max-w-md rounded-[1.6rem] p-6"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {selectedNode.avatarUrl && (
                    <img src={selectedNode.avatarUrl} alt={displayName(selectedNode)}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      style={{ border: "2px solid rgba(196,151,58,0.35)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {selectedNode.isVip && (
                        <span className="rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-[0.20em] font-bold"
                          style={{ background: "rgba(212,168,74,0.15)", border: "1px solid rgba(212,168,74,0.45)", color: "#D4A84A" }}>VIP</span>
                      )}
                      {selectedNode.verification === "verified" && (
                        <span className="status-chip status-accepted text-[9px]">{t("networkMap.verified")}</span>
                      )}
                      {selectedNode.targetUserId && sentIntros.has(selectedNode.targetUserId) && (
                        <span className="rounded-full px-2.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: "rgba(76,175,125,0.12)", border: "1px solid rgba(76,175,125,0.30)", color: "#4CAF7D" }}>Intro sent ✓</span>
                      )}
                    </div>
                    <h3 style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne, lineHeight: 1.15 }}>{displayName(selectedNode)}</h3>
                  </div>
                </div>
                <button onClick={() => setDetailOpen(false)} className="btn-quiet rounded-full px-3 py-1.5 text-xs flex-shrink-0">{t("common.close")}</button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {selectedNode.industry && (
                  <span className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em]"
                    style={{ background: `${nodePalette(selectedNode).border}12`, border: `1px solid ${nodePalette(selectedNode).border}28`, color: nodePalette(selectedNode).border }}>
                    {selectedNode.industry.replaceAll("_", " ")}
                  </span>
                )}
              </div>

              <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,248,235,0.018)", border: "1px solid rgba(196,151,58,0.09)" }}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(237,229,208,0.78)" }}>
                  {selectedNode.summary || "No additional details available."}
                </p>
              </div>

              {(selectedNode.website || selectedNode.annualRevenue) && (
                <div className="mb-4 flex flex-wrap gap-2 items-center">
                  {selectedNode.website && (
                    <a href={selectedNode.website} target="_blank" rel="noopener noreferrer"
                      className="text-sm underline truncate max-w-[180px]" style={{ color: G.gold }}>
                      {selectedNode.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {selectedNode.annualRevenue && selectedNode.annualRevenue !== "prefer_not_to_say" && (
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0"
                      style={{ background: "rgba(196,151,58,0.10)", border: "1px solid rgba(196,151,58,0.22)", color: G.gold }}>
                      {{ under_250k: "< €250k", "250k_to_1m": "€250k – €1M", "1m_to_5m": "€1M – €5M", over_5m: "> €5M" }[selectedNode.annualRevenue] ?? selectedNode.annualRevenue}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { label: "Signal", value: selectedNode.heat, note: "Grows with activity", badge: "activity" },
                  { label: "Trust", value: selectedNode.trustScore ?? "—", note: "Grows with reputation", badge: "reputation" },
                ].map(({ label, value, note, badge }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.11)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: G.muted }}>{label}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(196,151,58,0.10)", color: G.gold }}>{badge}</span>
                    </div>
                    <p className="text-xl font-semibold" style={{ color: G.champagne }}>
                      {value}<span className="text-xs font-normal ml-1" style={{ color: G.muted }}>/100</span>
                    </p>
                    <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: G.muted }}>{note}</p>
                  </div>
                ))}
              </div>

              {unlockableNode && (
                <button
                  onClick={() => { setDetailOpen(false); void unlockContact(); }}
                  disabled={busy}
                  className="btn-primary premium-button w-full rounded-xl px-4 py-3 text-sm disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #9E7428, #C4973A, #D4A84A)" }}
                >
                  {busy ? t("networkMap.introSending") : `${t("networkMap.sendIntro")} — ${introCost} credits`}
                </button>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIP Easter Egg — Founders' Vault */}
      <AnimatePresence>
        {vaultOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)" }}
            onClick={() => setVaultOpen(false)}
          >
            <motion.section
              initial={{ scale: 0.8, opacity: 0, rotateY: 10 }} animate={{ scale: 1, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="relative w-full max-w-md rounded-[1.8rem] p-8 overflow-hidden"
              style={{ background: "linear-gradient(145deg, #0d0c0a, #1a1408, #0d0c0a)", border: "1px solid rgba(212,168,74,0.45)", boxShadow: "0 0 60px rgba(212,168,74,0.20), 0 0 120px rgba(212,168,74,0.08)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Constellation background pattern */}
              <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(212,168,74,0.15) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(196,151,58,0.10) 0%, transparent 35%)" }} />

              <div className="relative text-center">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="text-5xl mb-4"
                >
                  ✦
                </motion.div>
                <p className="text-[10px] uppercase tracking-[0.45em] mb-2" style={{ color: "rgba(212,168,74,0.70)" }}>
                  Exclusive Access
                </p>
                <h2 style={{ fontFamily: G.display, fontSize: "2.2rem", color: "#F0D890", lineHeight: 1.1 }} className="mb-3">
                  Founders&apos; Vault
                </h2>
                <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(212,168,74,0.75)" }}>
                  You have discovered the secret constellation. As a VIP member of Balea Sphere, you hold access to the inner sanctum — where deals are made before the world knows they exist.
                </p>

                <div className="rounded-xl p-4 mb-6 text-left space-y-2" style={{ background: "rgba(212,168,74,0.06)", border: "1px solid rgba(212,168,74,0.18)" }}>
                  <p className="text-[10px] uppercase tracking-[0.20em] mb-3" style={{ color: "rgba(212,168,74,0.60)" }}>VIP Privileges</p>
                  {[
                    "Double credits on referrals",
                    "Priority matching by AI Concierge",
                    "First access to elite investment opportunities",
                    "Elite Circle — for the most exclusive tier",
                    "Your profile surfaced first in network searches",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "rgba(240,216,144,0.80)" }}>
                      <span style={{ color: "#D4A84A" }}>✦</span> {item}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Link href="/credits" className="flex-1 rounded-xl py-3 text-sm text-center font-semibold"
                    style={{ background: "linear-gradient(135deg, #9E7428, #C4973A, #D4A84A)", color: "#0C0B09" }}
                    onClick={() => setVaultOpen(false)}>
                    Manage Credits
                  </Link>
                  <button onClick={() => setVaultOpen(false)} className="btn-quiet rounded-xl px-5 py-3 text-sm">
                    {t("common.close")}
                  </button>
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-up modal */}
      <AnimatePresence>
        {topupOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="sheet-backdrop fixed inset-0 z-[60] flex items-end">
            <motion.section
              initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="surface-elevated mx-auto w-full max-w-lg rounded-t-[1.6rem] p-5 sm:mb-8 sm:rounded-[1.6rem]"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full sm:hidden" style={{ background: "rgba(196,151,58,0.35)" }} />
              <p className="text-[10px] uppercase tracking-[0.26em]" style={{ color: G.gold }}>Credits needed</p>
              <h3 className="mt-2" style={{ fontFamily: G.display, fontSize: "1.8rem", color: G.champagne }}>{shortfall} more credits required</h3>
              <p className="mt-1 text-sm" style={{ color: G.muted }}>
                {topupIsVip ? "This is a VIP member — introductions cost double. Choose a top-up to continue." : "Choose a top-up below. Your introduction will be sent automatically."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {smallestSufficient && (
                  <button onClick={() => void buyTopup(smallestSufficient.id)} disabled={topupBusy}
                    className="rounded-xl p-4 text-left transition-colors"
                    style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.22)" }}>
                    <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: G.muted }}>Minimal</p>
                    <p className="mt-1 text-base font-semibold" style={{ color: G.champagne }}>{smallestSufficient.label}</p>
                    <p className="text-xs" style={{ color: G.muted }}>{smallestSufficient.credits} credits · €{smallestSufficient.priceEur}</p>
                  </button>
                )}
                {recommendedTopup && recommendedTopup.id !== smallestSufficient?.id && (
                  <button onClick={() => void buyTopup(recommendedTopup.id)} disabled={topupBusy}
                    className="rounded-xl p-4 text-left transition-colors"
                    style={{ background: "rgba(196,151,58,0.10)", border: "1px solid rgba(196,151,58,0.35)" }}>
                    <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: G.gold }}>Recommended</p>
                    <p className="mt-1 text-base font-semibold" style={{ color: G.champagne }}>{recommendedTopup.label}</p>
                    <p className="text-xs" style={{ color: G.muted }}>{recommendedTopup.credits} credits · €{recommendedTopup.priceEur}</p>
                  </button>
                )}
              </div>
              <button onClick={() => setTopupOpen(false)} disabled={topupBusy} className="btn-quiet mt-4 rounded-full px-5 py-2 text-sm">{t("common.cancel")}</button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
