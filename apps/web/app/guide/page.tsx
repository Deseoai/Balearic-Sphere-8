import Link from "next/link";
import { TopNav } from "../../components/top-nav";

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

const chapters = [
  {
    title: "How access works",
    subtitle: "Curated, not purchased.",
    body: "Membership in Balea Sphere is earned through a curation process, not a subscription. You submit an application that explains who you are, what you bring, and what you seek. Our team reviews for genuine Balearic relevance — sector fit, track record, and mutual value. Strong applications are approved within 24–48 hours. Once approved, your Workspace unlocks and you receive your welcome credits.",
    detail: "Roles progress from applicant → member → verified member → premium member → circle member. Each level unlocks deeper visibility, more powerful introductions, and access to private circles within the network.",
  },
  {
    title: "How credits work",
    subtitle: "Intentional, not transactional.",
    body: "Credits are not a paywall — they are a quality filter that keeps every action in the network deliberate and high-trust. You spend credits when you choose to unlock something of real value: an introduction, a direct conversation, a marketplace listing, or an AI workflow. The cost is always shown before you act.",
    detail: "Action costs: Introduction unlock (15 cr) · Open chat thread (12 cr) · Publish listing (10 cr) · Circle access request (12 cr) · AI request (8 cr) · Concierge query (5 cr). Three plans: Starter €19 / 120 cr, Growth €49 / 360 cr, Inner Circle €99 / 900 cr.",
  },
  {
    title: "How the network map works",
    subtitle: "Signal, not noise.",
    body: "The Network Map is a living signal graph of your private circle. Each node represents a member, listing, AI insight, or access circle. Edge connections show the relationship type — core connections, opportunities, insights, and access paths. Gold nodes are members you can contact directly.",
    detail: "To connect: select a gold member node → read their relevance heat score and trust score → write a warm, personal introduction in the text field → click 'Send Private Introduction' (15 credits). You will be redirected to a private thread immediately. The recipient also receives an email notification.",
  },
  {
    title: "How messaging works",
    subtitle: "Unlocked, not open.",
    body: "Direct messaging in Balea Sphere is intentional by design. You unlock a conversation from the Network Map or directly from Messages using a member's email. Opening a thread costs 12 credits and ensures both parties entered the conversation with intent. Messages are private, end-to-end, and never shared.",
    detail: "Once a thread is open, sending messages is free. Threads update in real time (7-second refresh). You can open threads from the Network Map — the introduction flow automatically creates a thread and redirects you to Messages.",
  },
  {
    title: "How the Marketplace works",
    subtitle: "Off-market, member-only.",
    body: "The Marketplace is a curated feed of opportunities, partnerships, and private deals — visible only to verified members. Eight listing types cover the full range: from off-market property and investment opportunities to collaboration requests, event seats, and private deals. Listings are sorted by recency and type.",
    detail: "Publishing a listing costs 10 credits. You control visibility (all members, circle-only, or private), the suggested contact cost, and the minimum trust score required to engage. The listing fee keeps quality high and ensures every publish is intentional.",
  },
  {
    title: "How the AI concierge works",
    subtitle: "Guidance, not noise.",
    body: "The AI Concierge appears on every page as a context-aware assistant. On the Network Map, it can explain node signals and suggest who to contact first. In the Marketplace, it can help you refine your publish copy. In the Workspace, it gives you one clear next move. On mobile, it opens as a bottom sheet.",
    detail: "The Concierge adapts its suggestions to the page you are on. Authenticated members connect to our private AI service. The Concierge uses your platform context to give personalised, actionable answers — not generic chatbot responses.",
  },
];

export default function GuidePage() {
  return (
    <main className="world-public app-shell lg:with-ai-rail">
      <TopNav />

      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-[2rem]" style={{ minHeight: "52vh" }}>
        <img
          src="https://images.pexels.com/photos/1537986/pexels-photo-1537986.jpeg?auto=compress&cs=tinysrgb&w=1920&h=800&dpr=1"
          alt="Mediterranean coastline"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "brightness(0.30) saturate(0.75)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(12,11,9,0.25) 0%, rgba(12,11,9,0.80) 100%)" }}
        />
        <div className="relative flex h-full flex-col justify-end p-7 sm:p-10" style={{ minHeight: "52vh" }}>
          <p className="text-[10px] uppercase tracking-[0.36em]" style={{ color: G.gold }}>Member Guide</p>
          <h1
            className="mt-4 leading-tight"
            style={{ fontFamily: G.display, fontSize: "clamp(2.4rem,5vw,4rem)", color: G.champagne }}
          >
            Everything important,<br />in plain language.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "rgba(237,229,208,0.65)" }}>
            This guide explains how every part of Balea Sphere works — access, credits, the network, messaging, the marketplace, and the AI concierge. Read once, then act with confidence.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/workspace" className="btn-primary premium-button rounded-xl px-6 py-2.5 text-sm">Enter Workspace</Link>
            <Link href="/request-access" className="btn-secondary rounded-xl px-5 py-2.5 text-sm">Apply for Access</Link>
          </div>
        </div>
      </section>

      {/* Chapters */}
      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {chapters.map(chapter => (
          <article
            key={chapter.title}
            className="surface-elevated rounded-[1.5rem] p-5 sm:p-6"
          >
            <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.gold }}>
              {chapter.subtitle}
            </p>
            <h2 className="mt-2" style={{ fontFamily: G.display, fontSize: "1.6rem", color: G.champagne }}>
              {chapter.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: G.muted }}>
              {chapter.body}
            </p>
            <div
              className="mt-4 rounded-xl p-3 text-xs leading-relaxed"
              style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.12)", color: "rgba(237,229,208,0.60)" }}
            >
              {chapter.detail}
            </div>
          </article>
        ))}
      </section>

      {/* CTA */}
      <section
        className="mt-5 rounded-[1.8rem] p-6 sm:p-8 text-center"
        style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.16)" }}
      >
        <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>Ready?</p>
        <h2 className="mt-3" style={{ fontFamily: G.display, fontSize: "clamp(1.8rem,3.5vw,2.6rem)", color: G.champagne }}>
          The circle is waiting.
        </h2>
        <p className="mt-2 max-w-xl mx-auto text-sm" style={{ color: G.muted }}>
          Access is by application. We review for genuine fit — not volume.
          If you are building something real in the Balearics, this is the right circle.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/request-access" className="btn-primary premium-button rounded-xl px-7 py-3 text-sm">
            Apply for Membership
          </Link>
          <Link href="/workspace" className="btn-quiet rounded-xl px-6 py-3 text-sm">
            Member Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}
