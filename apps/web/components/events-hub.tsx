"use client";

import { useCallback, useEffect, useState } from "react";
import { apiBaseUrl, getSessionToken } from "../lib/api";
import { useLang } from "../lib/i18n";

type EventTopic = "networking" | "business" | "investment" | "lifestyle" | "wellness" | "social" | "other";

type EventRecord = {
  id: string;
  postedBy: string;
  postedByName?: string;
  postedByAvatarUrl?: string;
  title: string;
  topic: EventTopic;
  description: string;
  location: string;
  address?: string;
  link?: string;
  dateTime: string;
  endTime?: string;
  price: number;
  currency: string;
  maxAttendees?: number;
  status: "published" | "cancelled" | "completed";
  rsvpCount?: number;
  createdAt: string;
  updatedAt: string;
};

type EventAttendee = {
  userId: string;
  displayName?: string;
  companyName?: string;
  avatarUrl?: string;
  joinedAt: string;
};

type EventDetail = EventRecord & { attendees: EventAttendee[] };

type AuthUser = { userId: string; displayName?: string; role: string };

const TOPICS: { value: EventTopic; label: string }[] = [
  { value: "networking", label: "Networking" },
  { value: "business", label: "Business" },
  { value: "investment", label: "Investment" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "wellness", label: "Wellness" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

const TOPIC_COLORS: Record<EventTopic, { bg: string; text: string; border: string }> = {
  networking: { bg: "rgba(70,120,180,0.12)", text: "#7EB8F0", border: "rgba(70,120,180,0.25)" },
  business:   { bg: "rgba(196,151,58,0.12)", text: "var(--gold)", border: "rgba(196,151,58,0.25)" },
  investment: { bg: "rgba(80,160,100,0.12)", text: "#7DD4A0", border: "rgba(80,160,100,0.25)" },
  lifestyle:  { bg: "rgba(160,80,160,0.12)", text: "#D090D0", border: "rgba(160,80,160,0.25)" },
  wellness:   { bg: "rgba(60,160,160,0.12)", text: "#70D0CC", border: "rgba(60,160,160,0.25)" },
  social:     { bg: "rgba(180,80,120,0.12)", text: "#E898B8", border: "rgba(180,80,120,0.25)" },
  other:      { bg: "rgba(110,101,88,0.12)", text: "var(--text-secondary)", border: "rgba(110,101,88,0.25)" },
};

const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
  display: "var(--font-display)",
};

function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const merged: RequestInit = { ...init, headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined ?? {}) } };
  const res = await fetch(`${apiBaseUrl}${path}`, merged);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isPast(iso: string): boolean {
  return new Date(iso) < new Date();
}

function Avatar({ name, avatarUrl, size = 32 }: { name?: string; avatarUrl?: string; size?: number }) {
  const initials = name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  return avatarUrl ? (
    <img src={avatarUrl} alt={name ?? ""} className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: "1.5px solid rgba(196,151,58,0.30)" }} />
  ) : (
    <div className="flex items-center justify-center rounded-full shrink-0 font-bold"
      style={{ width: size, height: size, background: "rgba(196,151,58,0.15)", color: G.gold, border: "1.5px solid rgba(196,151,58,0.25)", fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

function TopicBadge({ topic }: { topic: EventTopic }) {
  const c = TOPIC_COLORS[topic];
  const label = TOPICS.find(t => t.value === topic)?.label ?? topic;
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {label}
    </span>
  );
}

function EventCard({ event, onSelect, isAttending }: {
  event: EventRecord;
  onSelect: () => void;
  isAttending?: boolean;
}) {
  const past = isPast(event.dateTime);
  const cancelled = event.status === "cancelled";
  return (
    <button
      onClick={onSelect}
      className="text-left w-full rounded-[1.4rem] p-5 transition-all hover:scale-[1.01]"
      style={{
        background: "rgba(20,18,16,0.70)",
        border: `1px solid ${cancelled ? "rgba(201,123,110,0.20)" : "rgba(196,151,58,0.14)"}`,
        opacity: cancelled || past ? 0.75 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <TopicBadge topic={event.topic} />
        {isAttending && !cancelled && !past && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: "rgba(80,160,100,0.15)", color: "#7DD4A0", border: "1px solid rgba(80,160,100,0.25)" }}>
            Attending ✓
          </span>
        )}
        {cancelled && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: "rgba(201,123,110,0.12)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.25)" }}>
            Cancelled
          </span>
        )}
      </div>

      <h3 className="font-semibold text-sm mb-2 line-clamp-2 leading-snug" style={{ color: G.champagne, fontFamily: G.display, fontSize: "1.05rem" }}>
        {event.title}
      </h3>

      <div className="space-y-1 mb-3">
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: G.muted }}>
          <span>📅</span> {formatDate(event.dateTime)} · {formatTime(event.dateTime)}
        </p>
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: G.muted }}>
          <span>📍</span> <span className="truncate">{event.location}</span>
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: G.muted }}>
            👥 {event.rsvpCount ?? 0}{event.maxAttendees ? ` / ${event.maxAttendees}` : ""} attending
          </span>
          {event.price > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: G.gold }}>
              {event.price} {event.currency}
            </span>
          )}
          {event.price === 0 && (
            <span className="text-[11px]" style={{ color: "#7DD4A0" }}>Free</span>
          )}
        </div>
        {event.postedByName && (
          <span className="text-[10px] truncate max-w-[100px]" style={{ color: G.muted }}>
            by {event.postedByName}
          </span>
        )}
      </div>
    </button>
  );
}

type FormState = {
  title: string;
  topic: EventTopic;
  description: string;
  location: string;
  address: string;
  link: string;
  dateTime: string;
  endTime: string;
  price: string;
  currency: string;
  maxAttendees: string;
};

const EMPTY_FORM: FormState = {
  title: "", topic: "networking", description: "", location: "",
  address: "", link: "", dateTime: "", endTime: "", price: "0", currency: "EUR", maxAttendees: "",
};

export function EventsHub() {
  const { t } = useLang();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [attending, setAttending] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailAttending, setDetailAttending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "past" | "mine">("upcoming");

  const loadUser = useCallback(async () => {
    const token = getSessionToken();
    if (!token) return;
    try {
      const data = await apiFetch<{ user: AuthUser }>("/v1/auth/me");
      setUser(data.user);
    } catch { /* not logged in */ }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/v1/events?status=published";
      if (filter === "mine") url = "/v1/events?mine=true";
      const data = await apiFetch<{ events: EventRecord[] }>(url);
      const evts = data.events;
      if (filter === "upcoming") {
        setEvents(evts.filter(e => !isPast(e.dateTime) && e.status === "published").sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()));
      } else if (filter === "past") {
        setEvents(evts.filter(e => isPast(e.dateTime) || e.status !== "published").sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()));
      } else {
        setEvents(evts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch {
      setError("Could not load events.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadUser(); }, [loadUser]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const openDetail = async (eventId: string) => {
    try {
      const data = await apiFetch<{ event: EventDetail; isAttending: boolean }>(`/v1/events/${eventId}`);
      setDetail(data.event);
      setDetailAttending(data.isAttending);
    } catch { setError("Could not load event details."); }
  };

  const handleRsvp = async (eventId: string) => {
    setRsvping(eventId);
    setError(null);
    try {
      const isCurrentlyAttending = detail?.id === eventId ? detailAttending : (attending[eventId] ?? false);
      if (isCurrentlyAttending) {
        await apiFetch(`/v1/events/${eventId}/rsvp`, { method: "DELETE" });
        setAttending(prev => ({ ...prev, [eventId]: false }));
        if (detail?.id === eventId) {
          setDetailAttending(false);
          setDetail(prev => prev ? { ...prev, rsvpCount: (prev.rsvpCount ?? 1) - 1, attendees: prev.attendees.filter(a => a.userId !== user?.userId) } : prev);
        }
      } else {
        await apiFetch(`/v1/events/${eventId}/rsvp`, { method: "POST" });
        setAttending(prev => ({ ...prev, [eventId]: true }));
        if (detail?.id === eventId) {
          setDetailAttending(true);
          setDetail(prev => prev ? { ...prev, rsvpCount: (prev.rsvpCount ?? 0) + 1 } : prev);
        }
        setSuccess("You're now attending this event!");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update RSVP.");
    } finally {
      setRsvping(null);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.location.trim() || !form.dateTime) {
      setError("Please fill in all required fields."); return;
    }
    setCreating(true); setError(null);
    try {
      const data = await apiFetch<{ event: EventRecord }>("/v1/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          topic: form.topic,
          description: form.description.trim(),
          location: form.location.trim(),
          address: form.address.trim() || undefined,
          link: form.link.trim() || undefined,
          dateTime: new Date(form.dateTime).toISOString(),
          endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
          price: parseFloat(form.price) || 0,
          currency: form.currency || "EUR",
          maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees) : undefined,
        }),
      });
      setEvents(prev => [data.event, ...prev]);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setSuccess("Event published successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create event.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelEvent = async (eventId: string) => {
    if (!confirm("Cancel this event? Attendees will no longer see it as active.")) return;
    try {
      await apiFetch(`/v1/events/${eventId}/cancel`, { method: "PATCH" });
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: "cancelled" } : e));
      if (detail?.id === eventId) setDetail(prev => prev ? { ...prev, status: "cancelled" } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel event.");
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="grid gap-5">

      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-3"
              style={{ background: "rgba(196,151,58,0.12)", border: "1px solid rgba(196,151,58,0.28)", color: G.gold }}>
              {t("events.eyebrow")}
            </span>
            <h1 style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,3rem)", color: G.champagne, lineHeight: 1.1 }}>
              {t("events.title")}
            </h1>
            <p className="mt-2 text-sm max-w-lg" style={{ color: G.muted }}>
              {t("events.subtext")}
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setError(null); }}
            className="btn-primary premium-button rounded-xl px-6 py-3 text-sm shrink-0"
          >
            {showCreate ? t("common.cancel") : t("events.createEvent")}
          </button>
        </div>

        {success && (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(80,160,100,0.10)", border: "1px solid rgba(80,160,100,0.25)", color: "#7DD4A0" }}>
            {success}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(201,123,110,0.08)", border: "1px solid rgba(201,123,110,0.25)", color: "#E8A898" }}>
            {error}
          </div>
        )}
      </section>

      {/* Create Event Form */}
      {showCreate && (
        <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.28em] mb-5" style={{ color: G.muted }}>New Event</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Event Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Sunset Networking Dinner Palma" className="field-control" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Topic *</label>
              <select value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value as EventTopic }))} className="field-control">
                {TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Venue / Location *</label>
              <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Club de Mar Mallorca" className="field-control" />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Full Address (optional)</label>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                placeholder="e.g. Moll Vell, 07012 Palma" className="field-control" />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Event Link / Website (optional)</label>
              <input value={form.link} onChange={e => setForm(p => ({ ...p, link: e.target.value }))}
                placeholder="https://..." type="url" className="field-control" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Date &amp; Start Time *</label>
              <input type="datetime-local" value={form.dateTime} onChange={e => setForm(p => ({ ...p, dateTime: e.target.value }))} className="field-control" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>End Time (optional)</label>
              <input type="datetime-local" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} className="field-control" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Price (0 = Free)</label>
              <div className="flex gap-2">
                <input type="number" min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="0" className="field-control" />
                <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                  className="field-control w-24 shrink-0">
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Max Attendees (optional)</label>
              <input type="number" min="1" value={form.maxAttendees} onChange={e => setForm(p => ({ ...p, maxAttendees: e.target.value }))}
                placeholder="Unlimited" className="field-control" />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Description *</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What will happen at this event? Who is it for? What should attendees expect?"
                rows={4} className="field-control resize-none" />
            </div>
          </div>

          <div className="mt-5 flex gap-3 flex-wrap">
            <button onClick={() => void handleCreate()} disabled={creating}
              className="btn-primary premium-button rounded-xl px-7 py-3 text-sm disabled:opacity-50">
              {creating ? t("common.loading") : t("events.publishEvent")}
            </button>
            <button onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setError(null); }}
              className="rounded-xl px-5 py-3 text-sm" style={{ border: "1px solid rgba(196,151,58,0.20)", color: G.muted }}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([["upcoming", t("events.filterUpcoming")], ["past", t("events.filterPast")], ["mine", t("events.filterMine")]] as [typeof filter, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className="rounded-full px-4 py-1.5 text-xs transition-all"
            style={{
              background: filter === val ? "rgba(196,151,58,0.15)" : "transparent",
              border: `1px solid ${filter === val ? "rgba(196,151,58,0.35)" : "rgba(196,151,58,0.12)"}`,
              color: filter === val ? G.gold : G.muted,
              fontWeight: filter === val ? 600 : 400,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Detail Panel + List (two-col on desktop when detail open) */}
      <div className={`grid gap-5 items-start ${detail ? "lg:grid-cols-[1fr_400px]" : ""}`}>

        {/* Events list */}
        <div>
          {loading ? (
            <div className="rounded-[1.4rem] p-8 text-center text-sm" style={{ color: G.muted }}>{t("events.loadingEvents")}</div>
          ) : events.length === 0 ? (
            <div className="rounded-[1.8rem] p-10 text-center surface-elevated">
              <p style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>{t("events.title")}</p>
              <p className="mt-2 text-sm" style={{ color: G.muted }}>
                {filter === "upcoming" ? t("events.noUpcomingEvents") : filter === "mine" ? t("events.filterMine") : t("events.noPastEvents")}
              </p>
              {filter === "upcoming" && (
                <button onClick={() => setShowCreate(true)} className="mt-4 btn-primary premium-button rounded-xl px-6 py-2.5 text-sm">
                  {t("events.createEvent")}
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map(evt => (
                <EventCard
                  key={evt.id}
                  event={evt}
                  onSelect={() => void openDetail(evt.id)}
                  isAttending={attending[evt.id]}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {detail && (
          <div className="rounded-[1.8rem] overflow-hidden" style={{ background: "rgba(14,13,11,0.95)", border: "1px solid rgba(196,151,58,0.18)" }}>
            {/* Sticky header */}
            <div className="p-5 pb-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <TopicBadge topic={detail.topic} />
                <button onClick={() => setDetail(null)} className="shrink-0 rounded-full h-7 w-7 flex items-center justify-center text-xs"
                  style={{ background: "rgba(196,151,58,0.08)", border: "1px solid rgba(196,151,58,0.18)", color: G.muted }}>
                  ✕
                </button>
              </div>

              <h2 style={{ fontFamily: G.display, fontSize: "1.5rem", color: G.champagne, lineHeight: 1.2 }}>
                {detail.title}
              </h2>

              {detail.status === "cancelled" && (
                <span className="mt-2 inline-block rounded-full px-3 py-0.5 text-xs"
                  style={{ background: "rgba(201,123,110,0.12)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.25)" }}>
                  Cancelled
                </span>
              )}
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Date/Time/Location */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.10)" }}>
                <div className="flex items-start gap-2">
                  <span className="text-base">📅</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: G.champagne }}>{formatDate(detail.dateTime)}</p>
                    <p className="text-xs" style={{ color: G.muted }}>
                      {formatTime(detail.dateTime)}{detail.endTime ? ` – ${formatTime(detail.endTime)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-base">📍</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: G.champagne }}>{detail.location}</p>
                    {detail.address && <p className="text-xs" style={{ color: G.muted }}>{detail.address}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🎟️</span>
                  <p className="text-sm font-medium" style={{ color: detail.price === 0 ? "#7DD4A0" : G.gold }}>
                    {detail.price === 0 ? "Free entry" : `${detail.price} ${detail.currency}`}
                  </p>
                </div>
                {detail.maxAttendees && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">👥</span>
                    <p className="text-sm" style={{ color: G.muted }}>
                      {detail.rsvpCount ?? 0} / {detail.maxAttendees} spots taken
                    </p>
                  </div>
                )}
                {detail.link && (
                  <div className="flex items-start gap-2">
                    <span className="text-base">🔗</span>
                    <a href={detail.link} target="_blank" rel="noopener noreferrer"
                      className="text-sm underline truncate" style={{ color: G.gold }}>
                      {detail.link.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] mb-2" style={{ color: G.muted }}>About this event</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: G.champagne }}>
                  {detail.description}
                </p>
              </div>

              {/* Host */}
              {detail.postedByName && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] mb-2" style={{ color: G.muted }}>Hosted by</p>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={detail.postedByName} avatarUrl={detail.postedByAvatarUrl} size={32} />
                    <span className="text-sm" style={{ color: G.champagne }}>{detail.postedByName}</span>
                  </div>
                </div>
              )}

              {/* RSVP button */}
              {detail.status === "published" && !isPast(detail.dateTime) && (
                <div>
                  {detail.maxAttendees && (detail.rsvpCount ?? 0) >= detail.maxAttendees && !detailAttending ? (
                    <div className="rounded-xl p-3 text-center text-sm" style={{ background: "rgba(201,123,110,0.08)", border: "1px solid rgba(201,123,110,0.20)", color: "#E8A898" }}>
                      This event is fully booked
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleRsvp(detail.id)}
                      disabled={rsvping === detail.id}
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50 ${detailAttending ? "" : "btn-primary premium-button"}`}
                      style={detailAttending ? {
                        background: "rgba(80,160,100,0.10)", border: "1px solid rgba(80,160,100,0.30)", color: "#7DD4A0"
                      } : {}}
                    >
                      {rsvping === detail.id ? "…" : detailAttending ? "✓ Attending — Click to leave" : "Join this Event"}
                    </button>
                  )}
                </div>
              )}

              {/* Cancel event button (own or admin) */}
              {(detail.postedBy === user?.userId || isAdmin) && detail.status === "published" && (
                <button onClick={() => void handleCancelEvent(detail.id)}
                  className="w-full rounded-xl py-2 text-xs"
                  style={{ border: "1px solid rgba(201,123,110,0.20)", color: "#E8A898" }}>
                  Cancel this Event
                </button>
              )}

              {/* Attendees */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: G.muted }}>
                  Attendees ({detail.attendees.length})
                </p>
                {detail.attendees.length === 0 ? (
                  <p className="text-xs" style={{ color: G.muted }}>No one has joined yet. Be the first!</p>
                ) : (
                  <div className="space-y-2.5">
                    {detail.attendees.map(a => (
                      <div key={a.userId} className="flex items-center gap-3">
                        <Avatar name={a.displayName ?? a.userId} avatarUrl={a.avatarUrl} size={30} />
                        <div className="min-w-0">
                          <p className="text-sm truncate" style={{ color: G.champagne }}>{a.displayName ?? "Member"}</p>
                          {a.companyName && <p className="text-[10px] truncate" style={{ color: G.muted }}>{a.companyName}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
