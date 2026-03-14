"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionToken, apiBaseUrl } from "../lib/api";

type AiRequest = {
  id: string;
  promptType: string;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed";
  responseSummary?: string;
  createdAt: string;
  completedAt?: string;
};

type NetworkNode = {
  id: string;
  type: string;
  label: string;
  targetUserId?: string;
  company?: string;
  industry?: string;
};

type InputMode = "none" | "member" | "text";

const COST = 8;

const TOOLS: {
  type: string;
  label: string;
  icon: string;
  description: string;
  inputMode: InputMode;
  placeholder?: string;
  runLabel: string;
}[] = [
  {
    type: "matchmaking",
    label: "Member Matchmaking",
    icon: "◈",
    description: "Analyse the live member network and surface your top 3–5 highest-fit connections based on your actual profile.",
    inputMode: "none",
    runLabel: "Run Analysis",
  },
  {
    type: "intro_engine",
    label: "Intro Engine",
    icon: "✦",
    description: "Select a member and get a personalised, ready-to-send introduction message crafted around both profiles.",
    inputMode: "member",
    runLabel: "Draft Introduction",
  },
  {
    type: "profile_optimization",
    label: "Profile Optimizer",
    icon: "◎",
    description: "Analyse your current profile completeness, listings, and activity — then get a concrete improvement plan.",
    inputMode: "none",
    runLabel: "Analyse Profile",
  },
  {
    type: "deal_radar",
    label: "Deal Radar",
    icon: "⊕",
    description: "Scan all active marketplace listings and surface the most relevant opportunities for your focus area.",
    inputMode: "text",
    placeholder: "e.g. Off-market real estate under €5M in Mallorca or Ibiza…",
    runLabel: "Scan Deals",
  },
  {
    type: "marketplace_assistant",
    label: "Marketplace Assistant",
    icon: "◇",
    description: "Describe what you want to list and get a polished, compelling listing draft ready to publish.",
    inputMode: "text",
    placeholder: "e.g. A co-investment opportunity in a 12-room boutique hotel in Sóller…",
    runLabel: "Draft Listing",
  },
  {
    type: "summary",
    label: "Network Summary",
    icon: "◉",
    description: "Get a strategic overview of your current network position and your three highest-leverage next moves.",
    inputMode: "none",
    runLabel: "Generate Summary",
  },
  {
    type: "reputation_signal",
    label: "Reputation Signal",
    icon: "⬡",
    description: "Analyse your trust and signal scores and receive a prioritised action plan to grow them.",
    inputMode: "none",
    runLabel: "Analyse Scores",
  },
  {
    type: "concierge",
    label: "Strategic Concierge",
    icon: "✧",
    description: "State your goal and get one decisive, tailored strategic recommendation for your next move.",
    inputMode: "text",
    placeholder: "e.g. I want to close two new investor relationships in the next 30 days…",
    runLabel: "Get Recommendation",
  },
];

const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
};

function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function AiToolsPanel({ balance, onCreditSpent }: { balance: number; onCreditSpent: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [members, setMembers] = useState<NetworkNode[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AiRequest[]>([]);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: AiRequest[] }>("/v1/ai/requests");
      setHistory(res.items.slice(0, 10));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Load members when intro_engine is selected
  useEffect(() => {
    if (selected !== "intro_engine" || members.length > 0) return;
    setMembersLoading(true);
    apiFetch<{ nodes: NetworkNode[] }>("/v1/network/graph")
      .then(res => {
        setMembers(res.nodes.filter(n => n.type === "user" && n.targetUserId));
      })
      .catch(() => {/* silent */})
      .finally(() => setMembersLoading(false));
  }, [selected, members.length]);

  // Poll until in-flight request completes
  useEffect(() => {
    if (!pollingId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ items: AiRequest[] }>("/v1/ai/requests");
        setHistory(res.items.slice(0, 10));
        const found = res.items.find(r => r.id === pollingId);
        if (found && (found.status === "completed" || found.status === "failed")) {
          setPollingId(null);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* silent */ }
    }, 3000);
    const timeout = setTimeout(() => {
      setPollingId(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }, 60000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); clearTimeout(timeout); };
  }, [pollingId]);

  function selectTool(type: string) {
    setSelected(selected === type ? null : type);
    setTextPrompt("");
    setSelectedMemberId("");
    setError(null);
  }

  async function submit() {
    if (submitting || !selected) return;
    const tool = TOOLS.find(t => t.type === selected)!;
    let prompt = "";
    if (tool.inputMode === "none") {
      prompt = "__auto__";
    } else if (tool.inputMode === "member") {
      if (!selectedMemberId) { setError("Please select a member."); return; }
      prompt = selectedMemberId;
    } else {
      if (!textPrompt.trim()) { setError("Please describe your request."); return; }
      prompt = textPrompt.trim();
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ id: string; status: string; responseSummary?: string; chargedCredits: number }>(
        "/v1/ai/requests",
        { method: "POST", body: JSON.stringify({ promptType: selected, prompt }) }
      );
      if (res.status !== "completed") setPollingId(res.id);
      setTextPrompt("");
      setSelectedMemberId("");
      setSelected(null);
      onCreditSpent();
      await loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit";
      try {
        const parsed = JSON.parse(msg) as { error?: string };
        if (parsed.error === "insufficient_credits") setError(`Not enough credits. You need ${COST} credits.`);
        else setError(parsed.error ?? msg);
      } catch { setError(msg); }
    } finally {
      setSubmitting(false);
    }
  }

  const tool = TOOLS.find(t => t.type === selected);

  return (
    <section className="surface-elevated rounded-[1.6rem] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: G.muted }}>AI Tools</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(196,151,58,0.55)" }}>Analyses real platform data · 8 credits each</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            background: balance < COST ? "rgba(201,123,110,0.12)" : "rgba(196,151,58,0.10)",
            color: balance < COST ? "#E8A898" : G.gold,
            border: `1px solid ${balance < COST ? "rgba(201,123,110,0.25)" : "rgba(196,151,58,0.25)"}`,
          }}
        >
          {balance} cr available
        </span>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {TOOLS.map(t => (
          <button
            key={t.type}
            onClick={() => selectTool(t.type)}
            className="rounded-[1rem] p-3 text-left transition-all"
            style={{
              background: selected === t.type ? "rgba(196,151,58,0.14)" : "rgba(255,248,235,0.03)",
              border: selected === t.type ? "1px solid rgba(196,151,58,0.45)" : "1px solid rgba(196,151,58,0.10)",
            }}
          >
            <span className="block text-lg mb-1" style={{ color: selected === t.type ? G.gold : "rgba(196,151,58,0.50)" }}>{t.icon}</span>
            <span className="block text-[11px] font-semibold leading-tight" style={{ color: selected === t.type ? G.champagne : G.muted }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tool Input Panel */}
      {selected && tool && (
        <div
          className="rounded-[1.2rem] p-4 mb-4"
          style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(196,151,58,0.16)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: G.champagne }}>
            {tool.icon} {tool.label}
          </p>
          <p className="text-[11px] mb-4" style={{ color: G.muted }}>{tool.description}</p>

          {/* None mode — no input needed */}
          {tool.inputMode === "none" && (
            <p className="text-[11px] italic mb-3" style={{ color: "rgba(196,151,58,0.50)" }}>
              This analysis uses your live profile and platform data automatically.
            </p>
          )}

          {/* Member picker mode */}
          {tool.inputMode === "member" && (
            <div className="mb-3">
              {membersLoading ? (
                <p className="text-[11px] animate-pulse" style={{ color: G.muted }}>Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-[11px]" style={{ color: G.muted }}>No network members found yet.</p>
              ) : (
                <select
                  value={selectedMemberId}
                  onChange={e => setSelectedMemberId(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(196,151,58,0.18)",
                    color: selectedMemberId ? G.champagne : "rgba(237,229,208,0.35)",
                  }}
                >
                  <option value="" disabled style={{ background: "#1a1a14" }}>Select a member…</option>
                  {members.map(m => (
                    <option key={m.targetUserId} value={m.targetUserId!} style={{ background: "#1a1a14" }}>
                      {m.label}{m.company ? ` — ${m.company}` : ""}{m.industry ? ` (${m.industry})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Text input mode */}
          {tool.inputMode === "text" && (
            <textarea
              value={textPrompt}
              onChange={e => setTextPrompt(e.target.value)}
              placeholder={tool.placeholder}
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(196,151,58,0.18)",
                color: G.champagne,
              }}
            />
          )}

          {error && (
            <p className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: "rgba(201,123,110,0.08)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.20)" }}>
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px]" style={{ color: "rgba(196,151,58,0.50)" }}>
              Costs <strong style={{ color: G.gold }}>8 credits</strong> · You have {balance} cr
            </p>
            <button
              onClick={() => void submit()}
              disabled={
                submitting ||
                balance < COST ||
                (tool.inputMode === "member" && !selectedMemberId) ||
                (tool.inputMode === "text" && !textPrompt.trim())
              }
              className="rounded-xl px-5 py-2 text-xs font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: "linear-gradient(135deg, #9E7428, #D4A84A)", color: "#0C0B09" }}
            >
              {submitting ? "Running…" : `${tool.runLabel} · 8 cr`}
            </button>
          </div>
        </div>
      )}

      {/* Request History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.20em] mb-3" style={{ color: "rgba(196,151,58,0.40)" }}>Recent Analyses</p>
          {history.map(req => {
            const toolMeta = TOOLS.find(t => t.type === req.promptType);
            const isProcessing = req.status === "queued" || req.status === "running";
            return (
              <div
                key={req.id}
                className="rounded-[1rem] p-4"
                style={{ background: "rgba(255,248,235,0.025)", border: "1px solid rgba(196,151,58,0.08)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "rgba(196,151,58,0.60)" }}>{toolMeta?.icon ?? "◈"}</span>
                    <span className="text-[11px] font-semibold" style={{ color: G.champagne }}>{toolMeta?.label ?? req.promptType}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isProcessing && (
                      <span className="text-[10px] animate-pulse" style={{ color: G.gold }}>Processing…</span>
                    )}
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] uppercase font-semibold tracking-wide"
                      style={{
                        background: req.status === "completed" ? "rgba(74,124,89,0.14)" : req.status === "failed" ? "rgba(155,58,74,0.14)" : "rgba(196,151,58,0.10)",
                        color: req.status === "completed" ? "#a0c890" : req.status === "failed" ? "#e8b4bc" : G.gold,
                        border: `1px solid ${req.status === "completed" ? "rgba(74,124,89,0.28)" : req.status === "failed" ? "rgba(155,58,74,0.28)" : "rgba(196,151,58,0.25)"}`,
                      }}
                    >
                      {req.status}
                    </span>
                    <span className="text-[9px]" style={{ color: G.muted }}>{timeAgo(req.createdAt)}</span>
                  </div>
                </div>
                {req.responseSummary && (
                  <div
                    className="mt-2 rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap"
                    style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.14)", color: "rgba(237,229,208,0.85)" }}
                  >
                    {req.responseSummary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {history.length === 0 && !selected && (
        <p className="text-xs text-center py-4" style={{ color: "rgba(196,151,58,0.30)" }}>
          Select a tool above to run a data-driven analysis
        </p>
      )}
    </section>
  );
}
