"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type DealRoom = {
  id: string;
  title: string;
  description?: string;
  status: string;
  created_by: string;
  deal_value?: number;
  currency: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
  message_count?: number;
};

type DealMember = {
  id: string;
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
  joined_at: string;
};

type DealMessage = {
  id: string;
  room_id: string;
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  content: string;
  created_at: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("balea_session_token") : null;
}
function getSessionUser() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("balea_session_user") : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function authHeaders() {
  return { "Authorization": `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

function statusColor(status: string) {
  switch (status) {
    case "open": return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    case "negotiating": return "text-gold bg-gold/10 border-gold/20";
    case "closed": return "text-muted bg-white/5 border-white/10";
    case "cancelled": return "text-[#C97B6E] bg-[#C97B6E]/10 border-[#C97B6E]/20";
    default: return "text-muted bg-white/5";
  }
}

export default function DealRoomHub() {
  const { t } = useLang();
  const [rooms, setRooms] = useState<DealRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRoom, setActiveRoom] = useState<DealRoom | null>(null);
  const [members, setMembers] = useState<DealMember[]>([]);
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", dealValue: "" });
  const [creating, setCreating] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionUser = getSessionUser();

  async function loadRooms() {
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms`, { headers: authHeaders() });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setRooms(data.dealRooms ?? []);
      setError("");
    } catch {
      setError(t("dealRoom.errorLoading"));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoom(id: string) {
    setRoomLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms/${id}`, { headers: authHeaders() });
      if (!res.ok) { setActiveRoom(null); return; }
      const data = await res.json();
      setActiveRoom(data.dealRoom);
      setMembers(data.members ?? []);
      setMessages(data.messages ?? []);
    } catch { /* ignore */ } finally {
      setRoomLoading(false);
    }
  }

  async function pollMessages(id: string) {
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms/${id}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim() || !activeRoom) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms/${activeRoom.id}/messages`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ content: msgInput.trim() })
      });
      if (res.ok) {
        setMsgInput("");
        await pollMessages(activeRoom.id);
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch { /* ignore */ } finally { setSending(false); }
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ title: createForm.title, description: createForm.description || undefined, dealValue: createForm.dealValue ? parseFloat(createForm.dealValue) : undefined })
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ title: "", description: "", dealValue: "" });
        await loadRooms();
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  }

  async function updateStatus(status: string) {
    if (!activeRoom) return;
    try {
      const res = await fetch(`${API_BASE}/v1/deal-rooms/${activeRoom.id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRoom(data.dealRoom);
        setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, status } : r));
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!sessionUser) { setLoading(false); return; }
    loadRooms();
  }, []);

  useEffect(() => {
    if (activeRoom) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollMessages(activeRoom.id), 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [activeRoom?.id]);

  function formatDate(iso: string) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
  }

  function formatTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  }

  if (!sessionUser) {
    return (
      <div className="app-shell py-20 text-center lg:with-ai-rail">
        <p className="text-muted">{t("dealRoom.signInPrompt")}</p>
      </div>
    );
  }

  // Detail View
  if (activeRoom) {
    const isOwner = members.find(m => m.user_id === sessionUser?.id)?.role === "owner";
    return (
      <div className="app-shell py-8 lg:with-ai-rail">
        <button onClick={() => { setActiveRoom(null); if (pollRef.current) clearInterval(pollRef.current); }} className="btn-quiet text-xs px-4 py-2 mb-6">
          {t("dealRoom.backToRooms")}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Room info + Members */}
          <div className="lg:col-span-1 space-y-4">
            <div className="panel-card-strong p-5">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-display text-xl text-ink">{activeRoom.title}</h2>
                <span className={`status-chip text-[10px] px-2 py-1 border ${statusColor(activeRoom.status)}`}>
                  {t(`dealRoom.status${activeRoom.status.charAt(0).toUpperCase() + activeRoom.status.slice(1)}`)}
                </span>
              </div>
              {activeRoom.description && <p className="text-muted text-xs leading-relaxed mb-4">{activeRoom.description}</p>}
              {activeRoom.deal_value && (
                <p className="text-gold font-display text-sm">€{activeRoom.deal_value.toLocaleString()} {activeRoom.currency}</p>
              )}
              <p className="text-muted text-[10px] mt-2">{t("dealRoom.createdBy")} · {formatDate(activeRoom.created_at)}</p>
            </div>

            {/* Status update */}
            {isOwner && (
              <div className="panel-card p-4">
                <p className="text-muted text-[10px] uppercase tracking-widest mb-3">{t("dealRoom.changeStatus")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {["open", "negotiating", "closed", "cancelled"].map(s => (
                    <button key={s} onClick={() => updateStatus(s)}
                      className={`btn-quiet text-[10px] px-3 py-1.5 text-center ${activeRoom.status === s ? "border-gold/40 text-gold" : ""}`}>
                      {t(`dealRoom.status${s.charAt(0).toUpperCase() + s.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            <div className="panel-card p-4">
              <p className="text-muted text-[10px] uppercase tracking-widest mb-3">{t("dealRoom.members")} ({members.length})</p>
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-charcoal border border-white/10 flex items-center justify-center text-muted text-[10px]">
                        {(m.display_name ?? "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-xs truncate">{m.display_name ?? "Member"}</p>
                      <p className="text-muted text-[10px]">{m.role === "owner" ? t("dealRoom.ownerBadge") : t("dealRoom.collaboratorBadge")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Messages */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="panel-card-strong flex flex-col" style={{ height: "60vh", minHeight: 400 }}>
              <div className="p-4 border-b border-white/5">
                <p className="text-muted text-[10px] uppercase tracking-widest">{t("dealRoom.messages")}</p>
              </div>
              {/* Message list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <p className="text-muted text-sm text-center py-8">{t("dealRoom.noMessages")}</p>
                )}
                {messages.map(msg => {
                  const isMe = msg.user_id === sessionUser?.id;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      {msg.avatar_url ? (
                        <img src={msg.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-charcoal border border-white/10 flex items-center justify-center text-muted text-[10px] flex-shrink-0 mt-1">
                          {(msg.display_name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                        <div className="flex items-center gap-2">
                          <span className="text-muted text-[10px]">{msg.display_name ?? "Member"}</span>
                          <span className="text-muted/60 text-[9px]">{formatTime(msg.created_at)}</span>
                        </div>
                        <div className={`px-4 py-2.5 rounded-xl text-sm leading-relaxed ${isMe ? "bg-gold/15 border border-gold/20 text-ink" : "bg-charcoal border border-white/5 text-ink"}`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {/* Input */}
              <form onSubmit={sendMessage} className="p-4 border-t border-white/5 flex gap-3">
                <input
                  className="field-control flex-1"
                  placeholder={t("dealRoom.messagePlaceholder")}
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !msgInput.trim()} className="btn-primary px-5 py-2 text-sm">
                  {t("dealRoom.sendMessage")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="app-shell py-12 lg:with-ai-rail">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-gold font-display mb-3">{t("dealRoom.eyebrow")}</p>
          <h1 className="font-display text-4xl md:text-5xl text-ink mb-4">{t("dealRoom.title")}</h1>
          <p className="text-muted text-sm max-w-xl">{t("dealRoom.subtext")}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary px-6 py-3 text-sm self-start mt-8">
          {t("dealRoom.createRoom")}
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(12,11,9,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="panel-card-strong w-full max-w-lg p-7">
            <h3 className="font-display text-2xl text-ink mb-6">{t("dealRoom.createRoom")}</h3>
            <form onSubmit={createRoom} className="space-y-4">
              <div>
                <label className="text-muted text-xs block mb-1">{t("dealRoom.roomTitle")} *</label>
                <input className="field-control w-full" required value={createForm.title} onChange={e => setCreateForm(p => ({...p, title: e.target.value}))} />
              </div>
              <div>
                <label className="text-muted text-xs block mb-1">{t("dealRoom.roomDescription")}</label>
                <textarea className="field-control w-full" rows={3} value={createForm.description} onChange={e => setCreateForm(p => ({...p, description: e.target.value}))} />
              </div>
              <div>
                <label className="text-muted text-xs block mb-1">{t("dealRoom.dealValue")}</label>
                <input className="field-control w-full" type="number" min="0" step="1000" value={createForm.dealValue} onChange={e => setCreateForm(p => ({...p, dealValue: e.target.value}))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={creating} className="btn-primary px-6 py-2.5 text-sm flex-1">
                  {creating ? "…" : t("dealRoom.createRoom")}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-quiet px-5 py-2.5 text-sm">{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-muted text-sm text-center py-20">{t("dealRoom.loadingRooms")}</p>}
      {!loading && error && <p className="text-muted text-sm text-center py-20">{error}</p>}

      {/* Empty */}
      {!loading && !error && rooms.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted text-sm mb-4">{t("dealRoom.noRooms")}</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary px-6 py-3 text-sm">{t("dealRoom.createRoom")}</button>
        </div>
      )}

      {/* Room List */}
      {!loading && rooms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rooms.map(room => (
            <div key={room.id} className="panel-card-strong flex flex-col cursor-pointer group hover:border-gold/20 transition-colors" onClick={() => loadRoom(room.id)}>
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-lg text-ink leading-snug group-hover:text-gold transition-colors">{room.title}</h3>
                  <span className={`status-chip text-[10px] px-2 py-1 ml-2 flex-shrink-0 border ${statusColor(room.status)}`}>
                    {t(`dealRoom.status${room.status.charAt(0).toUpperCase() + room.status.slice(1)}`)}
                  </span>
                </div>
                {room.description && <p className="text-muted text-xs leading-relaxed mb-3 line-clamp-2">{room.description}</p>}
                {room.deal_value && <p className="text-gold font-display text-sm mb-2">€{room.deal_value.toLocaleString()} {room.currency}</p>}
              </div>
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-muted text-[10px]">{room.member_count ?? 0} {t("dealRoom.memberCount")} · {room.message_count ?? 0} msg</span>
                <span className="text-gold text-[10px] group-hover:underline">{t("dealRoom.openRoom")} →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
