"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl, getSessionToken } from "../lib/api";

type EliteMessage = {
  id: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
};

type EliteMember = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  avatarUrl?: string;
  trustScore?: number;
  signalScore?: number;
};

type Me = { userId: string; displayName?: string; isElite?: boolean; role: string; avatarUrl?: string };

function mentionKey(name: string): string {
  return name.split(/\s+/)[0].toLowerCase();
}

function renderContent(content: string, myUserId: string, meDisplayName?: string): React.ReactNode[] {
  const myKey = meDisplayName ? mentionKey(meDisplayName) : "";
  const parts = content.split(/(@[\w\u00C0-\u024F\u1E00-\u1EFF-]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w\u00C0-\u024F\u1E00-\u1EFF-]+$/.test(part)) {
      const token = part.slice(1).toLowerCase();
      const isMe = myKey && token === myKey;
      return (
        <span
          key={i}
          className="inline-block rounded px-1 font-semibold"
          style={isMe
            ? { background: "rgba(212,168,74,0.28)", color: "#F0D890", border: "1px solid rgba(212,168,74,0.45)" }
            : { background: "rgba(212,168,74,0.12)", color: "#D4A84A" }
          }
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
  display: "var(--font-display)",
};

function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers as Record<string, string> ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function Avatar({ name, avatarUrl, size = 36 }: { name?: string; avatarUrl?: string; size?: number }) {
  const initials = name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  return avatarUrl ? (
    <img src={avatarUrl} alt={name ?? ""} className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: "1.5px solid rgba(212,168,74,0.40)" }} />
  ) : (
    <div className="flex items-center justify-center rounded-full shrink-0 font-bold"
      style={{ width: size, height: size, background: "rgba(212,168,74,0.15)", color: G.gold, border: "1.5px solid rgba(212,168,74,0.30)", fontSize: size * 0.34 }}>
      {initials}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function EliteCircleHub() {
  const [me, setMe]                 = useState<Me | null>(null);
  const [messages, setMessages]     = useState<EliteMessage[]>([]);
  const [members, setMembers]       = useState<EliteMember[]>([]);
  const [input, setInput]           = useState("");
  const [sending, setSending]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<EliteMember[]>([]);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const messagesEndRef              = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadAll = useCallback(async () => {
    const token = getSessionToken();
    if (!token) { setLoading(false); return; }
    try {
      const [meRes, msgsRes, membersRes] = await Promise.all([
        apiFetch<{ user: Me }>("/v1/auth/me"),
        apiFetch<{ messages: EliteMessage[] }>("/v1/elite/messages"),
        apiFetch<{ members: EliteMember[] }>("/v1/elite/members"),
      ]);
      setMe(meRes.user);
      setMessages(msgsRes.messages);
      setMembers(membersRes.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access denied.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { if (messages.length) scrollToBottom(); }, [messages.length, scrollToBottom]);

  // Poll for new messages every 8s
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await apiFetch<{ messages: EliteMessage[] }>("/v1/elite/messages");
        setMessages(res.messages);
      } catch { /* silent */ }
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  function handleInputChange(val: string) {
    setInput(val);
    // Detect @mention query: find last @ before cursor
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1 && (atIdx === 0 || /\s/.test(val[atIdx - 1]))) {
      const query = val.slice(atIdx + 1).toLowerCase();
      if (!query.includes(" ")) {
        setMentionQuery(query);
        const filtered = members.filter(m => {
          const name = (m.displayName ?? "").toLowerCase();
          const key = mentionKey(m.displayName ?? "");
          return key.startsWith(query) || name.startsWith(query);
        }).slice(0, 5);
        setMentionSuggestions(filtered);
        return;
      }
    }
    setMentionQuery(null);
    setMentionSuggestions([]);
  }

  function insertMention(member: EliteMember) {
    const key = mentionKey(member.displayName ?? member.userId);
    const atIdx = input.lastIndexOf("@");
    const before = input.slice(0, atIdx);
    const after = input.slice(atIdx + 1 + (mentionQuery?.length ?? 0));
    setInput(`${before}@${key}${after.startsWith(" ") ? "" : " "}${after}`);
    setMentionQuery(null);
    setMentionSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setMentionQuery(null);
    setMentionSuggestions([]);
    setSending(true);
    try {
      const res = await apiFetch<{ message: EliteMessage }>("/v1/elite/messages", {
        method: "POST",
        body: JSON.stringify({ content: input.trim() }),
      });
      setMessages(prev => [...prev, res.message]);
      setInput("");
      setTimeout(scrollToBottom, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-10 text-center">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          <p className="text-sm" style={{ color: G.muted }}>Entering the Elite Circle…</p>
        </motion.div>
      </section>
    );
  }

  if (error || !me) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-10 text-center">
        <div className="text-4xl mb-4">✦</div>
        <h2 style={{ fontFamily: G.display, fontSize: "2rem", color: G.champagne }}>Elite Circle</h2>
        <p className="mt-3 text-sm max-w-sm mx-auto" style={{ color: G.muted }}>
          {error?.includes("elite_required")
            ? "This space is reserved for Elite Circle members. Contact the administrator to inquire about Elite status."
            : error ?? "Sign in to access this area."}
        </p>
      </section>
    );
  }

  // Group messages by date
  let lastDate = "";
  const messageElements: React.ReactNode[] = [];
  for (const msg of messages) {
    const dateLabel = formatDate(msg.createdAt);
    if (dateLabel !== lastDate) {
      lastDate = dateLabel;
      messageElements.push(
        <div key={`date-${msg.id}`} className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px" style={{ background: "rgba(212,168,74,0.12)" }} />
          <span className="text-[9px] uppercase tracking-[0.22em] shrink-0" style={{ color: "rgba(212,168,74,0.40)" }}>{dateLabel}</span>
          <div className="flex-1 h-px" style={{ background: "rgba(212,168,74,0.12)" }} />
        </div>
      );
    }
    const isMe = msg.userId === me.userId;
    messageElements.push(
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}
      >
        <Avatar name={msg.displayName} avatarUrl={msg.avatarUrl} size={32} />
        <div className={`max-w-[78%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
          <div className="flex items-baseline gap-2" style={{ flexDirection: isMe ? "row-reverse" : "row" }}>
            <span className="text-[10px] font-semibold" style={{ color: isMe ? "#D4A84A" : G.champagne }}>
              {msg.displayName ?? "Member"}
            </span>
            <span className="text-[9px]" style={{ color: G.muted }}>{formatTime(msg.createdAt)}</span>
          </div>
          <div
            className="rounded-[1rem] px-3.5 py-2.5 text-sm leading-relaxed"
            style={isMe ? {
              background: "linear-gradient(135deg, rgba(196,151,58,0.22), rgba(212,168,74,0.14))",
              border: "1px solid rgba(212,168,74,0.30)",
              color: G.champagne,
              borderBottomRightRadius: "4px",
            } : {
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(196,151,58,0.12)",
              color: "rgba(237,229,208,0.85)",
              borderBottomLeftRadius: "4px",
            }}
          >
            {renderContent(msg.content, me?.userId ?? "", me?.displayName)}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Header */}
      <section
        className="rounded-[1.8rem] p-6 sm:p-8 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0d0c0a, #1a1408, #0d0c0a)",
          border: "1px solid rgba(212,168,74,0.30)",
          boxShadow: "0 0 40px rgba(212,168,74,0.08)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 15% 50%, rgba(212,168,74,0.06) 0%, transparent 40%), radial-gradient(circle at 85% 50%, rgba(196,151,58,0.04) 0%, transparent 40%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <motion.span
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="text-2xl"
              >✦</motion.span>
              <span className="text-[10px] uppercase tracking-[0.40em]" style={{ color: "rgba(212,168,74,0.65)" }}>
                Elite Circle
              </span>
            </div>
            <h1 style={{ fontFamily: G.display, fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#F0D890", lineHeight: 1.1 }}>
              The Inner Sanctum
            </h1>
            <p className="mt-2 max-w-xl text-sm" style={{ color: "rgba(212,168,74,0.65)" }}>
              An exclusive space for the most valued members of Balea Sphere. What is shared here, stays here.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMembers(v => !v)}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors"
              style={{
                background: showMembers ? "rgba(212,168,74,0.18)" : "rgba(212,168,74,0.06)",
                border: "1px solid rgba(212,168,74,0.30)",
                color: "#D4A84A",
              }}
            >
              {members.length} Members
            </button>
          </div>
        </div>
      </section>

      <section className={`grid gap-4 ${showMembers ? "lg:grid-cols-[1fr_280px]" : ""}`}>
        {/* Chat area */}
        <div className="flex flex-col rounded-[1.5rem] overflow-hidden"
          style={{ background: "rgba(10,9,8,0.85)", border: "1px solid rgba(212,168,74,0.14)", minHeight: "60vh" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0" style={{ maxHeight: "60vh" }}>
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl mb-3">✦</p>
                  <p className="text-sm" style={{ color: G.muted }}>Be the first to speak in this circle.</p>
                </div>
              </div>
            ) : messageElements}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t relative" style={{ borderColor: "rgba(212,168,74,0.12)" }}>
            {error && (
              <p className="mb-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: "rgba(201,123,110,0.08)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.20)" }}>
                {error}
              </p>
            )}
            {/* @mention suggestion dropdown */}
            {mentionSuggestions.length > 0 && (
              <div
                className="absolute left-4 right-4 bottom-full mb-2 rounded-xl overflow-hidden z-10"
                style={{ background: "rgba(14,13,11,0.97)", border: "1px solid rgba(212,168,74,0.30)", boxShadow: "0 8px 24px rgba(0,0,0,0.50)" }}
              >
                {mentionSuggestions.map(m => (
                  <button
                    key={m.userId}
                    onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                    style={{ color: G.champagne }}
                  >
                    <Avatar name={m.displayName ?? m.companyName} avatarUrl={m.avatarUrl} size={24} />
                    <span>{m.displayName ?? m.companyName ?? "Member"}</span>
                    <span className="text-[10px] ml-auto" style={{ color: G.muted }}>@{mentionKey(m.displayName ?? m.userId)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (mentionSuggestions.length > 0 && e.key === "Escape") { setMentionSuggestions([]); return; }
                  if (e.key === "Enter" && !e.shiftKey && mentionSuggestions.length === 0) { e.preventDefault(); void sendMessage(); }
                }}
                placeholder="Share something… use @ to mention a member"
                className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(212,168,74,0.18)",
                  color: G.champagne,
                }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={sending || !input.trim()}
                className="rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: "linear-gradient(135deg, #9E7428, #D4A84A)", color: "#0C0B09", minWidth: 72 }}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Members sidebar — desktop */}
        <AnimatePresence>
          {showMembers && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="hidden lg:block rounded-[1.5rem] p-5"
              style={{ background: "rgba(10,9,8,0.85)", border: "1px solid rgba(212,168,74,0.14)" }}
            >
              <p className="text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: "rgba(212,168,74,0.55)" }}>
                Elite Members
              </p>
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <Avatar name={m.displayName ?? m.companyName} avatarUrl={m.avatarUrl} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: G.champagne }}>
                        {m.companyName ?? m.displayName ?? "Elite Member"}
                      </p>
                      {m.industry && (
                        <p className="text-[10px] truncate capitalize" style={{ color: G.muted }}>
                          {m.industry.replaceAll("_", " ")}
                        </p>
                      )}
                    </div>
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2.5, delay: Math.random() * 2 }}
                      className="shrink-0 text-[10px]"
                      style={{ color: "#D4A84A" }}
                    >
                      ✦
                    </motion.span>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-xs" style={{ color: G.muted }}>No elite members yet.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Members drawer — mobile only */}
      <AnimatePresence>
        {showMembers && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.65)" }}
              onClick={() => setShowMembers(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-[1.8rem] p-5 pb-8"
              style={{ background: "#0e0d0b", border: "1px solid rgba(212,168,74,0.22)", maxHeight: "70vh", overflowY: "auto" }}
            >
              {/* Handle */}
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full" style={{ background: "rgba(212,168,74,0.30)" }} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: "rgba(212,168,74,0.55)" }}>
                Elite Members · {members.length}
              </p>
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <Avatar name={m.displayName ?? m.companyName} avatarUrl={m.avatarUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: G.champagne }}>
                        {m.companyName ?? m.displayName ?? "Elite Member"}
                      </p>
                      {m.industry && (
                        <p className="text-[11px] truncate capitalize" style={{ color: G.muted }}>
                          {m.industry.replaceAll("_", " ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs" style={{ color: "#D4A84A" }}>✦</span>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-xs" style={{ color: G.muted }}>No elite members yet.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
