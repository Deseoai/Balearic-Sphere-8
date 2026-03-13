"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getJson, getSessionToken, postJson } from "../lib/api";

type AuthUser = { userId: string; email: string; displayName?: string; };
type ChatPeer = { userId: string; email: string; displayName?: string; role: string; accessLevel: string; };
type ChatThread = {
  id: string; status: "active" | "blocked" | "archived";
  createdAt: string; updatedAt: string;
  lastMessageAt?: string; lastMessagePreview?: string;
  peer: ChatPeer;
};
type ChatMessage = { id: string; threadId: string; senderUserId: string; content: string; createdAt: string; };
type ApiList<T> = { items: T[]; };

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

function ts(iso: string): string {
  try { return fmt.format(new Date(iso)); } catch { return iso; }
}

function labelPeer(peer: ChatPeer): string {
  return peer.displayName?.trim() || "Member";
}

function peerRole(peer: ChatPeer): string {
  const role = peer.role?.replace(/_/g, " ") ?? "Member";
  const level = peer.accessLevel?.replace(/_/g, " ");
  return level ? `${role} · ${level}` : role;
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message.trim();
  try {
    const p = JSON.parse(raw) as { error?: string; message?: string };
    if (p.error === "missing_session_token" || p.error === "invalid_or_expired_session") return "Please sign in from Workspace first.";
    if (p.error === "member_access_required") return "Direct chat unlocks when your application is approved.";
    if (p.error === "invalid_payload") return "Please check your inputs and try again.";
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  return raw.slice(0, 220);
}

export function MemberMessages() {
  const searchParams = useSearchParams();
  const initialThreadFromUrl = searchParams.get("thread") ?? "";

  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState(false);
  const [me, setMe]                 = useState<AuthUser | null>(null);
  const [threads, setThreads]       = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [statusLine, setStatusLine] = useState("Loading conversations…");
  const [errorLine, setErrorLine]   = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");

  const selectedThread = useMemo(() => threads.find(t => t.id === selectedThreadId) ?? null, [selectedThreadId, threads]);

  async function refreshThreads(options?: { silent?: boolean }): Promise<void> {
    if (!getSessionToken()) {
      setMe(null); setThreads([]); setSelectedThreadId(null); setMessages([]);
      setStatusLine("Sign in from Workspace to use member chat."); setErrorLine(null); setLoading(false);
      return;
    }
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [meRes, threadsRes] = await Promise.all([
        getJson<{ user: AuthUser }>("/v1/auth/me", { auth: true }),
        getJson<ApiList<ChatThread>>("/v1/chat/threads", { auth: true }),
      ]);
      const rows = threadsRes.items ?? [];
      setMe(meRes.user); setThreads(rows);
      const preferred = initialThreadFromUrl && rows.some(r => r.id === initialThreadFromUrl)
        ? initialThreadFromUrl : rows[0]?.id ?? null;
      setSelectedThreadId(c => {
        if (c && rows.some(r => r.id === c)) return c;
        return preferred;
      });
      setStatusLine("Conversations synced."); setErrorLine(null);
    } catch (error) {
      setMe(null); setThreads([]); setSelectedThreadId(null); setMessages([]);
      setErrorLine(friendlyError(error, "Could not load conversations."));
      setStatusLine("Chat unavailable.");
    } finally { if (!silent) setLoading(false); }
  }

  async function loadMessages(threadId: string, options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent ?? false;
    if (!silent) setBusy(true);
    try {
      const r = await getJson<{ items: ChatMessage[] }>(`/v1/chat/threads/${threadId}/messages?limit=120`, { auth: true });
      setMessages(r.items ?? []); setErrorLine(null);
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not load messages."));
    } finally { if (!silent) setBusy(false); }
  }

  useEffect(() => { void refreshThreads(); }, [initialThreadFromUrl]);

  useEffect(() => {
    if (!selectedThreadId || !me) { setMessages([]); return; }
    void loadMessages(selectedThreadId);
  }, [selectedThreadId, me?.userId]);

  useEffect(() => {
    if (!selectedThreadId || !me) return;
    const timer = window.setInterval(() => {
      void loadMessages(selectedThreadId, { silent: true });
      void refreshThreads({ silent: true });
    }, 7000);
    return () => window.clearInterval(timer);
  }, [selectedThreadId, me?.userId]);

  async function sendMessage(): Promise<void> {
    if (!selectedThreadId || !messageInput.trim()) return;
    setBusy(true); setErrorLine(null);
    try {
      await postJson(`/v1/chat/threads/${selectedThreadId}/messages`, { content: messageInput.trim() }, { auth: true });
      setMessageInput("");
      await loadMessages(selectedThreadId, { silent: true });
      await refreshThreads({ silent: true });
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not send message."));
    } finally { setBusy(false); }
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 text-center">
        <p className="text-sm" style={{ color: G.muted }}>Loading your conversations…</p>
      </section>
    );
  }

  /* ── Not signed in ─────────────────────────────────────────── */
  if (!me) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-7 sm:p-9">
        <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>Messages</p>
        <h1 className="mt-3" style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,2.8rem)", color: G.champagne }}>
          Private member conversations
        </h1>
        <p className="mt-2 max-w-xl text-sm" style={{ color: G.muted }}>
          Sign in from Workspace once, then continue your conversations here. New conversations are initiated from the Network Map — every connection starts with an introduction.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href="/workspace" className="btn-primary premium-button rounded-xl px-6 py-2.5 text-sm">Open Workspace</Link>
          <Link href="/network" className="btn-quiet rounded-xl px-5 py-2.5 text-sm">Explore Network</Link>
        </div>
      </section>
    );
  }

  /* ── Main View ─────────────────────────────────────────────── */
  return (
    <div className="grid gap-4">
      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>Messages</p>
            <h1 className="mt-2 leading-tight" style={{ fontFamily: G.display, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", color: G.champagne }}>
              Private conversations
            </h1>
            <p className="mt-1 text-sm" style={{ color: G.muted }}>{statusLine}</p>
            {errorLine && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{errorLine}</p>}
          </div>
          <Link href="/network" className="btn-secondary rounded-xl px-5 py-2.5 text-sm">
            Discover Members →
          </Link>
        </div>
      </section>

      {/* Thread list + message view */}
      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        {/* Threads */}
        <article className="surface-elevated rounded-[1.5rem] p-4">
          <h2 className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: G.muted }}>
            Conversations {threads.length > 0 && `(${threads.length})`}
          </h2>
          <div className="max-h-[580px] space-y-2 overflow-auto pr-0.5">
            {threads.length === 0 && (
              <div className="rounded-xl p-4" style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.10)" }}>
                <p className="text-sm" style={{ color: G.muted }}>
                  No conversations yet.
                </p>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(154,144,128,0.70)" }}>
                  Discover members in the Network Map, send a private introduction, and start a conversation there.
                </p>
                <Link
                  href="/network"
                  className="mt-3 inline-block text-xs font-medium underline"
                  style={{ color: G.gold }}
                >
                  Open Network Map →
                </Link>
              </div>
            )}
            {threads.map(thread => {
              const isActive = selectedThreadId === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => {
                    setSelectedThreadId(thread.id);
                    const next = new URL(window.location.href);
                    next.searchParams.set("thread", thread.id);
                    window.history.replaceState({}, "", next.toString());
                  }}
                  className="w-full rounded-xl p-3 text-left transition-colors"
                  style={{
                    background: isActive ? "rgba(196,151,58,0.10)" : "rgba(255,248,235,0.020)",
                    border: isActive ? "1px solid rgba(196,151,58,0.30)" : "1px solid rgba(196,151,58,0.08)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase"
                      style={{ background: "rgba(196,151,58,0.15)", color: G.gold, border: "1px solid rgba(196,151,58,0.25)" }}
                    >
                      {labelPeer(thread.peer).charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: G.champagne }}>
                        {labelPeer(thread.peer)}
                      </p>
                      <p className="mt-0.5 truncate text-xs" style={{ color: G.muted }}>
                        {thread.lastMessagePreview || "No messages yet"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-right text-[10px]" style={{ color: "rgba(196,151,58,0.45)" }}>
                    {ts(thread.lastMessageAt ?? thread.updatedAt)}
                  </p>
                </button>
              );
            })}
          </div>
        </article>

        {/* Message view */}
        <article className="surface-elevated flex flex-col rounded-[1.5rem] p-4" style={{ minHeight: "500px" }}>
          {!selectedThread ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
              <p className="text-[10px] uppercase tracking-[0.28em] mb-3" style={{ color: G.muted }}>No conversation selected</p>
              <p className="text-sm" style={{ color: G.muted }}>
                Choose a conversation from the list, or{" "}
                <Link href="/network" className="underline" style={{ color: G.gold }}>
                  discover new members
                </Link>{" "}
                in the Network Map.
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div
                className="mb-3 flex items-center gap-3 rounded-xl p-3"
                style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.12)" }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase"
                  style={{ background: "rgba(196,151,58,0.15)", color: G.gold, border: "1px solid rgba(196,151,58,0.25)" }}
                >
                  {labelPeer(selectedThread.peer).charAt(0)}
                </span>
                <div>
                  <p className="font-medium" style={{ color: G.champagne }}>{labelPeer(selectedThread.peer)}</p>
                  <p className="text-xs capitalize" style={{ color: G.muted }}>{peerRole(selectedThread.peer)}</p>
                </div>
              </div>

              {/* Messages */}
              <div
                className="flex-1 space-y-2 overflow-auto rounded-xl p-3"
                style={{ background: "rgba(8,7,6,0.50)", border: "1px solid rgba(196,151,58,0.08)", minHeight: "300px", maxHeight: "420px" }}
              >
                {messages.length === 0 && (
                  <p className="p-4 text-center text-sm" style={{ color: G.muted }}>No messages yet. Write your first message below.</p>
                )}
                {messages.map(item => {
                  const mine = item.senderUserId === me.userId;
                  return (
                    <div
                      key={item.id}
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "ml-auto" : ""}`}
                      style={{
                        background: mine ? "rgba(196,151,58,0.16)" : "rgba(255,248,235,0.06)",
                        border: mine ? "1px solid rgba(196,151,58,0.28)" : "1px solid rgba(255,248,235,0.08)",
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] mb-1" style={{ color: mine ? G.gold : G.muted }}>
                        {mine ? "You" : labelPeer(selectedThread.peer)}
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap" style={{ color: mine ? G.champagne : "rgba(237,229,208,0.88)" }}>
                        {item.content}
                      </p>
                      <p className="mt-1.5 text-right text-[10px]" style={{ color: "rgba(196,151,58,0.40)" }}>
                        {ts(item.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="sticky-mobile-cta mt-3 flex gap-2">
                <input
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  placeholder="Write your message…"
                  className="field-control"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={busy || !messageInput.trim()}
                  className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
                >
                  {busy ? "…" : "Send"}
                </button>
              </div>
            </>
          )}
        </article>
      </section>
    </div>
  );
}
