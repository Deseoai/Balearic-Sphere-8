"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSessionToken, postJson } from "../lib/api";
import { useLang } from "../lib/i18n";

type ConciergeMessage = { role: "assistant" | "user"; text: string; };

type RouteProfile = {
  title: string;
  context: string;
  suggestions: string[];
};

function routeProfile(pathname: string): RouteProfile {
  const BASE_CONTEXT = `You are the AI Concierge of Balea Sphere — a curated private members network for founders, investors, and ecosystem builders in Mallorca and the Balearic Islands (Mallorca, Ibiza, Menorca, Formentera).

PLATFORM OVERVIEW:
Balea Sphere is an exclusive, invite-only business network. Members are vetted through an AI-scored application process and manually reviewed by the admin team. The platform emphasises intentional connections, signal-based trust, and real business value.

NAVIGATION (always suggest these links when relevant):
- /workspace — Member dashboard: credits, activity overview, AI tools, VIP earnings
- /network — Network Map: interactive graph of all members, click nodes to see profiles and send intros
- /marketplace — Off-market deals, opportunities, strategic partnerships (members only)
- /messages — Private direct messages with connected members
- /pitches — Send or receive investment/partnership pitches (VIP inbox)
- /events — Offline events: real meetups, dinners, summits, networking sessions
- /credits — Credit balance, purchase plans, action costs
- /settings — Profile settings, photo upload, session management
- /request-access — Application form for new members
- /guide — Platform guide and how-to

MEMBERSHIP TIERS:
- Explorer: basic access, can browse
- Curated: selected member, can engage
- Verified: identity verified, full access
- Insider: deep access, premium features
- Private Circle Eligible: highest tier

ROLES: public_visitor → applicant → member → verified_member → premium_member → circle_member → moderator → admin → super_admin

CREDIT SYSTEM:
- Credits are intentional access tokens (not a paywall)
- New members receive 200 welcome credits on admin approval
- Actions cost: Network Intro 15cr, Chat thread 12cr, Marketplace listing 10cr, Circle access 12cr, AI request 8cr, AI concierge 5cr
- VIP member pitches: 25cr per pitch
- Plans: Starter 120cr €19, Growth 360cr €49, Inner Circle 900cr €99
- VIPs earn: +8cr per intro received, +3cr every 10 profile views, +20cr when pitch accepted

SCORING:
- Signal Score (0-100): activity-based. Grows with: intros sent (+5), listings (+4), AI requests (+2), chat threads (+2), circle requests (+3)
- Trust Score (20-100): reputation-based. Profile completeness adds: name +5, company +5, avatar +3, verified +12. Grows slowly through actions like pitch accepted (+2)

VIP SYSTEM:
- VIP status granted to members with annual revenue ≥ €1M
- VIPs are visible to all members but cost more to contact
- VIPs earn passive credits from engagement
- VIP badge shown in Network Map with golden pulsing ring

NETWORK MAP:
- Interactive canvas showing all member nodes
- Gold pulsing nodes = VIP members
- Click any node to see: company, industry, revenue range, website, trust score, verification
- "Send Introduction" unlocks a direct channel (15cr, or 30cr for VIPs)
- Signal score shown as heat/activity indicator

EVENTS:
- Members can create offline events: dinners, yacht days, investment summits, networking
- All members can RSVP and see attendee list
- Events have: topic (networking/business/investment/lifestyle/wellness/social), date, location, price, max attendees

APPLICATIONS:
- AI pre-scores applications 45-100 based on keywords and completeness
- Premium keywords: investment, family office, hospitality, real estate, venture, operator, luxury, fund, growth, yachting
- Human review follows AI scoring
- Review time: 24-48 hours

INDUSTRIES in the network: technology, real_estate, hospitality, finance, investment, fashion, yachting, arts, wellness, consulting, legal, media, food_beverage, events, other

MAGIC LINK AUTH:
- No passwords. Login via magic link sent to email. Valid 30 min. Session lasts 30 days.
- Request new link at /settings or via the sign-in page

ACTIONABLE NAVIGATION HINTS:
When answering, if a page is relevant, suggest it like this: "→ Go to /network" or "→ Visit /events"
When asked about members in a specific industry, note that you can query the member directory.`;

  if (pathname.startsWith("/marketplace")) return {
    title: "Marketplace Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Marketplace — curated off-market deals, opportunities, strategic partnerships, private deals. 8 listing types: opportunity, request, offer, collaboration, premium access, event seat, strategic need, private deal. Publishing costs 10 credits. Only verified members can see listings.",
    suggestions: ["What listing types exist?", "How do I publish?", "Show members in real estate", "What are private deals?"],
  };
  if (pathname.startsWith("/network")) return {
    title: "Network Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Network Map — interactive signal graph of all members. Click gold nodes for VIPs. Use 'Send Introduction' to unlock a direct channel. Signal score = activity level. Trust score = reputation.",
    suggestions: ["How do intros work?", "What is a VIP node?", "Find tech members", "How does trust grow?"],
  };
  if (pathname.startsWith("/messages")) return {
    title: "Messages Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Private Messages — direct threads with connected members. Opening a new thread costs 12 credits (24cr for VIPs). Threads opened via Network Map intro are automatic.",
    suggestions: ["How do I start a thread?", "What does a thread cost?", "How do I find the right contact?"],
  };
  if (pathname.startsWith("/credits")) return {
    title: "Credits Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Credits Studio — view balance, purchase credit packages. Starter 120cr €19 (occasional use), Growth 360cr €49 (active user), Inner Circle 900cr €99 (power user). Credits never expire.",
    suggestions: ["Which plan suits me?", "What gives most value?", "How do I earn credits?", "What do 360 credits buy?"],
  };
  if (pathname.startsWith("/events")) return {
    title: "Events Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Offline Events — real meetings within the Balea Sphere community. Create events: dinners, summits, yacht days, investment sessions. RSVP to join, see who's attending.",
    suggestions: ["How do I create an event?", "What events are coming up?", "Who attends events?", "Are events free?"],
  };
  if (pathname.startsWith("/pitches")) return {
    title: "Pitches Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Pitches — send targeted pitches to VIP members (25 credits). VIPs can accept or decline. Accepted pitches open a direct channel and give the VIP +20 credits.",
    suggestions: ["Who can I pitch to?", "How much does a pitch cost?", "What makes a good pitch?", "How do I accept pitches?"],
  };
  if (pathname.startsWith("/admin")) return {
    title: "Admin Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Admin Panel — review applications, manage members, approve circles, view audit logs. AI pre-score 45-100. Strong applicants: >76. Approved members receive 200 welcome credits automatically.",
    suggestions: ["How is AI score calculated?", "How do I issue a magic link?", "What's the approval workflow?"],
  };
  if (pathname.startsWith("/workspace")) return {
    title: "Workspace Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Member Workspace — your private command centre. Shows credits, activity, AI tools, VIP earnings panel. Best starting point after login.",
    suggestions: ["What should I do first?", "How do I grow my trust score?", "How do I get more credits?", "What is signal score?"],
  };
  if (pathname.startsWith("/request-access")) return {
    title: "Application Concierge",
    context: BASE_CONTEXT + "\n\nCURRENT PAGE: Access Application — apply for Balea Sphere membership. Strong applications: specific value offered, concrete Balearic connection, real business sector. Website is required. LinkedIn/Instagram optional.",
    suggestions: ["What makes a strong application?", "How long is review?", "What access level should I pick?", "What industries are accepted?"],
  };
  return {
    title: "Balea Concierge",
    context: BASE_CONTEXT,
    suggestions: ["How does membership work?", "What is the credit system?", "How do I apply?", "What is the Network Map?"],
  };
}

function localFallback(message: string, pathname: string): string {
  const q = message.toLowerCase();

  if (q.includes("credit") || q.includes("plan") || q.includes("price") || q.includes("cost") || q.includes("buy") || q.includes("purchase")) {
    return "Credits are intentional access tokens — not a paywall.\n\nAction costs:\n• Network Intro: 15cr (30cr for VIPs)\n• Chat thread: 12cr (24cr for VIPs)\n• Marketplace listing: 10cr\n• Circle request: 12cr\n• AI request: 8cr\n• AI concierge: 5cr\n\nPackages:\n• Starter: 120cr for €19\n• Growth: 360cr for €49\n• Inner Circle: 900cr for €99\n\n→ Go to /credits to purchase or check your balance.";
  }
  if (q.includes("trust") || q.includes("reputation") || q.includes("score")) {
    return "Your Trust Score (20–100) reflects your reputation on the platform.\n\nIt grows with:\n• Profile completeness (name, company, avatar, verified)\n• Verified status: +12 points\n• Pitches accepted: +2 points\n\nYour Signal Score (0–100) reflects your activity:\n• Intros sent: +5\n• Listings published: +4\n• AI requests: +2\n• Chat threads: +2\n\nBoth scores are visible to others in the Network Map.\n\n→ Go to /network to see your scores.";
  }
  if (q.includes("event") || q.includes("meeting") || q.includes("dinner") || q.includes("summit")) {
    return "Offline Events are real gatherings organised by and for Balea Sphere members.\n\nYou can:\n• Browse upcoming events: dinners, investment summits, yacht days, networking\n• RSVP with one click and see who else is attending\n• Create your own event with location, date, price, and description\n\nAll members can participate. Events are completely free to create.\n\n→ Go to /events to browse or create.";
  }
  if (q.includes("vip") || q.includes("earn") || q.includes("passive")) {
    return "VIP Members earn passive credits automatically:\n\n• +8 credits each time someone sends them an intro\n• +3 credits every 10 profile views in the Network Map\n• +20 credits when they accept a pitch\n\nVIP status is granted to members with annual revenue ≥ €1M. It appears as a golden pulsing ring on the Network Map.\n\n→ Go to /workspace to see your VIP earnings panel.";
  }
  if (q.includes("intro") || q.includes("unlock") || q.includes("contact") || q.includes("connect")) {
    return "To connect with a member:\n\n1. Go to the Network Map → /network\n2. Click on a member node\n3. Read their profile: company, industry, trust score\n4. Click 'Send Private Introduction' (15cr, or 30cr for VIP nodes)\n5. A private message thread opens automatically\n\nThe introduction includes a warm personal message you write. This keeps connections intentional.\n\n→ Go to /network to start connecting.";
  }
  if (q.includes("apply") || q.includes("join") || q.includes("member") || q.includes("application")) {
    return "Membership at Balea Sphere is curated and by application.\n\nStrong applications:\n• Specific about what value you bring to the community\n• Concrete Balearic connection (business, property, lifestyle)\n• Relevant sector: hospitality, investment, real estate, yachting, venture, luxury\n• Website is required. LinkedIn/Instagram are optional but recommended.\n\nReview time: 24–48 hours. You receive 200 welcome credits on approval.\n\n→ Apply at /request-access.";
  }
  if (q.includes("marketplace") || q.includes("listing") || q.includes("deal") || q.includes("opportunit")) {
    return "The Marketplace is a private feed of off-market opportunities, visible only to verified members.\n\n8 listing types:\n• Opportunity, Request, Offer, Collaboration\n• Premium Access, Event Seat, Strategic Need, Private Deal\n\nPublishing a listing costs 10 credits and increases your Signal Score (+4).\n\n→ Go to /marketplace to browse or publish.";
  }
  if (q.includes("pitch") || q.includes("invest")) {
    return "The Pitch system lets you send targeted proposals to VIP members.\n\nHow it works:\n• Each pitch costs 25 credits\n• VIPs review in their private inbox and can accept or decline\n• Accepted pitch: VIP gets +20 credits, you get a direct conversation channel\n\nOnly members with sufficient credits and access can pitch.\n\n→ Go to /pitches to compose a pitch.";
  }
  if (q.includes("message") || q.includes("chat") || q.includes("thread") || q.includes("conversation")) {
    return "Private messaging at Balea Sphere is unlocked via intros or direct thread opening.\n\n• Via Network Map intro (15cr): sends a warm message, thread opens automatically\n• Direct thread open (12cr): start a conversation with any member\n• VIP targets cost double: 24–30cr\n\n→ Go to /messages to see your active threads, or /network to start a new connection.";
  }
  if (q.includes("login") || q.includes("magic") || q.includes("sign in") || q.includes("session")) {
    return "Balea Sphere uses magic links — no passwords needed.\n\n• Request a sign-in link at /settings or the login page\n• Link arrives by email, valid for 30 minutes\n• Your session stays active for 30 days on this device\n• You can sign in on multiple devices\n\n→ Go to /settings to request a new magic link or manage your session.";
  }
  if (q.includes("network map") || q.includes("graph") || q.includes("map") || q.includes("node")) {
    return "The Network Map is the heart of Balea Sphere — a live signal graph of all members.\n\n• Gold pulsing rings = VIP members (high value, higher contact cost)\n• Node size reflects trust/signal score\n• Click any node: see company, industry, revenue range, website\n• Send Introduction from any node to unlock a direct channel\n\nThe map shows your network's real activity and signal strength in real time.\n\n→ Go to /network to explore.";
  }
  if (q.includes("technolog") || q.includes("real estate") || q.includes("hospitality") || q.includes("finance") || q.includes("investment") || q.includes("who") || q.includes("member") || q.includes("company") || q.includes("sector") || q.includes("industry")) {
    return "Balea Sphere connects professionals across the Balearic Islands in sectors including:\n\nTechnology, Real Estate, Hospitality, Finance & Investment, Fashion, Yachting, Arts, Wellness, Consulting, Legal, Media, Food & Beverage, Events.\n\nTo find members in a specific industry:\n→ Go to /network — the Network Map shows member industries in their profile cards.\n\nNote: We show company names but protect personal identities in public searches.";
  }
  if (pathname.startsWith("/admin")) {
    return "Admin panel tips:\n\n• AI pre-score 45–100. Strong applicants score >76\n• Review: value statement, Balearic relevance, profile completeness\n• Approved members receive 200 welcome credits automatically\n• Issue magic links directly from the Users tab\n• Audit log tracks all admin actions\n\nFocus approval on: hospitality, investment, real estate, yachting, venture, luxury services.";
  }
  return "I am your private Balea Sphere concierge. I know the full platform: credits, network, events, pitches, marketplace, trust scores, VIP system, and how to maximise your membership value.\n\nAsk me anything — I will give you a direct, actionable answer.\n\n→ Start at /workspace for your member overview.";
}

export function AiConciergeShell() {
  const { t } = useLang();
  const pathname = usePathname();
  const profile = useMemo(() => routeProfile(pathname), [pathname]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [showNudge, setShowNudge]     = useState(false);
  const [busy, setBusy]               = useState(false);
  const [input, setInput]             = useState("");
  const [messages, setMessages]       = useState<ConciergeMessage[]>([]);

  const intro = useMemo(() => {
    const greetings: Record<string, string> = {
      "/marketplace": "Welcome to the Marketplace. Browse off-market deals, strategic partnerships, and private listings. I can help you find the right opportunity or craft a compelling listing.",
      "/network": "The Network Map shows your private signal graph. Gold rings = VIP members. I can guide your best introduction strategy and explain what each node means.",
      "/messages": "Your private threads live here. I can help you open a conversation, suggest the right tone, or explain how threading costs work.",
      "/credits": "Credits keep interactions intentional. I can explain each plan, calculate your monthly needs, and tell you how to earn free credits through activity.",
      "/workspace": "Your private command centre. Ask me what to do next — I will give you one clear, actionable answer.",
      "/request-access": "Applying for access? I can tell you what strong applications look like, which industries are most accepted, and how to frame your value statement.",
      "/events": "Offline events connect the Balea Sphere community in real life. I can help you discover upcoming events, create your own, or understand how the RSVP system works.",
      "/pitches": "The Pitch system connects you directly with VIP members. Ask me how to craft a compelling pitch, what it costs, and how VIPs manage their inbox.",
    };
    for (const [path, text] of Object.entries(greetings)) {
      if (pathname.startsWith(path)) return text;
    }
    return "Welcome to Balea Sphere. Ask me anything — about access, credits, the network, or how to make your most valuable next move.";
  }, [pathname]);

  useEffect(() => {
    setMessages([{ role: "assistant", text: intro }]);
  }, [intro]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (desktopOpen) { setShowNudge(false); return; }
    const timer = window.setTimeout(() => setShowNudge(true), 4000);
    return () => window.clearTimeout(timer);
  }, [desktopOpen, pathname]);

  async function ask(message: string): Promise<void> {
    const clean = message.trim();
    if (!clean) return;
    const history = messages.slice(-8).map(m => ({ role: m.role, content: m.text }));
    setInput("");
    setBusy(true);
    setMessages(c => [...c, { role: "user", text: clean }]);
    try {
      const hasSession = Boolean(getSessionToken());
      if (hasSession && !pathname.startsWith("/admin/login")) {
        const result = await postJson<{ answer: string; suggestions?: string[] }>(
          "/v1/ai/support",
          { message: clean, locale: typeof navigator !== "undefined" ? navigator.language : "en", context: profile.context, history },
          { auth: true }
        );
        const suggestion = (result.suggestions ?? []).slice(0, 2).join(" · ");
        const fullText = suggestion ? `${result.answer}\n\n${suggestion}` : result.answer;
        setMessages(c => [...c, { role: "assistant", text: fullText }]);
        return;
      }
      setMessages(c => [...c, { role: "assistant", text: localFallback(clean, pathname) }]);
    } catch {
      setMessages(c => [...c, { role: "assistant", text: localFallback(clean, pathname) }]);
    } finally { setBusy(false); }
  }

  if (pathname.startsWith("/admin/login")) return null;

  const goldStyle = { color: "var(--gold)" };
  const champagneStyle = { color: "var(--champagne)" };
  const mutedStyle = { color: "var(--text-secondary)" };

  /* ── Message bubble ──────────────────────────────────────── */
  const Bubble = ({ msg }: { msg: ConciergeMessage }) => {
    const parts = msg.text.split(/(→ (?:Go to |Visit )?\/[\w/-]+[^\s]*)/g);
    return (
      <div
        className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.role === "assistant" ? "" : "ml-4"}`}
        style={{
          background: msg.role === "assistant" ? "rgba(255,248,235,0.04)" : "rgba(196,151,58,0.12)",
          border: msg.role === "assistant" ? "1px solid rgba(196,151,58,0.10)" : "1px solid rgba(196,151,58,0.25)",
          color: msg.role === "assistant" ? "rgba(237,229,208,0.85)" : "var(--champagne)",
          whiteSpace: "pre-wrap",
        }}
      >
        {parts.map((part, i) => {
          const match = part.match(/→ (?:Go to |Visit )?(\/[\w/-]+)/);
          if (match) {
            return (
              <a key={i} href={match[1]}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ml-0.5"
                style={{ background: "rgba(196,151,58,0.15)", color: "var(--gold)", border: "1px solid rgba(196,151,58,0.25)", textDecoration: "none" }}
              >
                → {match[1]}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <>
      {/* ── Desktop Panel ──────────────────────────────────── */}
      <div className="fixed bottom-5 right-4 z-50 hidden lg:block">
        <motion.aside
          animate={{ width: desktopOpen ? 340 : 72 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="concierge-panel relative overflow-hidden rounded-[1.3rem]"
          style={{ height: "76vh", minHeight: "500px", maxHeight: "740px" }}
        >
          {desktopOpen ? (
            <div className="flex h-full flex-col p-4">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold" style={champagneStyle}>{profile.title}</p>
                  <p className="mt-0.5 text-[10px]" style={mutedStyle}>{t("aiConcierge.poweredBy")}</p>
                </div>
                <button
                  onClick={() => setDesktopOpen(false)}
                  className="concierge-chip rounded-full px-2.5 py-1 text-[10px]"
                >
                  {t("aiConcierge.closeConcierge")}
                </button>
              </div>

              <div className="my-3 h-px" style={{ background: "rgba(196,151,58,0.12)" }} />

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-1.5">
                {profile.suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => void ask(s)}
                    className="concierge-chip rounded-full px-2.5 py-1 text-[10px] transition-colors hover:border-gold"
                    disabled={busy}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Thread */}
              <div
                className="mt-3 flex-1 space-y-2 overflow-auto rounded-xl p-2"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(196,151,58,0.08)" }}
              >
                {messages.slice(-12).map((m, i) => <Bubble key={`${m.role}-${i}`} msg={m} />)}
                {busy && (
                  <div
                    className="rounded-xl px-3 py-2 text-[10px]"
                    style={{ background: "rgba(196,151,58,0.05)", color: "rgba(196,151,58,0.50)" }}
                  >
                    {t("aiConcierge.thinking")}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="mt-3 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={t("aiConcierge.inputPlaceholder")}
                  className="field-control text-xs"
                  style={{ fontSize: "0.78rem" }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void ask(input); } }}
                />
                <button
                  onClick={() => void ask(input)}
                  disabled={busy || !input.trim()}
                  className="btn-primary rounded-xl px-3 py-2 text-xs disabled:opacity-50 shrink-0"
                >
                  →
                </button>
              </div>
            </div>
          ) : (
            /* Collapsed */
            <div className="flex h-full flex-col items-center justify-between py-4">
              <button onClick={() => setDesktopOpen(true)} className="concierge-pill rounded-full px-2.5 py-2 text-[10px] font-semibold">
                AI
              </button>
              <div className="flex flex-col items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--gold)" }} />
                <span
                  className="text-[9px] uppercase tracking-[0.28em]"
                  style={{ ...mutedStyle, writingMode: "vertical-rl" as const }}
                >
                  Concierge
                </span>
              </div>
              <button
                onClick={() => void ask(profile.suggestions[0])}
                className="concierge-chip rounded-full px-2 py-1 text-[9px]"
                disabled={busy}
              >
                Ask
              </button>
            </div>
          )}

          {/* Nudge */}
          <AnimatePresence>
            {!desktopOpen && showNudge && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onClick={() => { setDesktopOpen(true); setShowNudge(false); }}
                className="surface-elevated absolute -left-[196px] top-4 w-[182px] rounded-xl p-3 text-left"
                style={{ border: "1px solid rgba(196,151,58,0.20)" }}
              >
                <p className="text-[9px] uppercase tracking-[0.16em]" style={mutedStyle}>Your concierge</p>
                <p className="mt-1 text-xs" style={champagneStyle}>{profile.suggestions[0]}</p>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.aside>
      </div>

      {/* ── Mobile trigger ─────────────────────────────────── */}
      <div className="fixed bottom-[76px] right-3 z-50 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="concierge-pill px-4 py-2.5 text-xs font-semibold rounded-full"
        >
          ✦ {t("aiConcierge.openConcierge")}
        </button>
      </div>

      {/* ── Mobile sheet ───────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sheet-backdrop fixed inset-0 z-[70] flex items-end lg:hidden">
            <motion.section
              initial={{ y: 340 }} animate={{ y: 0 }} exit={{ y: 340 }}
              transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
              className="concierge-panel w-full rounded-t-[1.5rem] p-4"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: "rgba(196,151,58,0.35)" }} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={champagneStyle}>{profile.title}</p>
                <button onClick={() => setMobileOpen(false)} className="concierge-chip rounded-full px-2.5 py-1 text-xs">{t("common.close")}</button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.suggestions.slice(0, 2).map(s => (
                  <button key={s} onClick={() => void ask(s)} className="concierge-chip rounded-full px-2.5 py-1 text-xs" disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>

              <div
                className="mt-3 max-h-[32vh] space-y-2 overflow-auto rounded-xl p-2"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(196,151,58,0.08)" }}
              >
                {messages.slice(-8).map((m, i) => <Bubble key={`${m.role}-${i}`} msg={m} />)}
                {busy && <div className="rounded-xl px-3 py-2 text-[10px]" style={{ color: "rgba(196,151,58,0.50)" }}>{t("aiConcierge.thinking")}</div>}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={t("aiConcierge.inputPlaceholder")}
                  className="field-control text-sm"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void ask(input); } }}
                />
                <button onClick={() => void ask(input)} disabled={busy || !input.trim()} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50 shrink-0">
                  →
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
