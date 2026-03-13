import Link from "next/link";
import { TopNav } from "../components/top-nav";

const sections = [
  {
    href: "/workspace",
    eyebrow: "Private Entry",
    title: "Your Workspace",
    text: "Secure command centre. Every signal, every conversation, every opportunity in one place.",
    accent: "#C4973A",
    img: "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
  {
    href: "/network",
    eyebrow: "Living Graph",
    title: "The Network",
    text: "A living signal map. Discover members by company and sector. Unlock introductions with intention.",
    accent: "#3B6FA8",
    img: "https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
  {
    href: "/messages",
    eyebrow: "Encrypted Threads",
    title: "Private Messages",
    text: "Direct, intentional conversations. Initiated from the Network Map. No noise. No unsolicited contact.",
    accent: "#4A7C59",
    img: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
  {
    href: "/marketplace",
    eyebrow: "Curated Deals",
    title: "Marketplace",
    text: "Off-market opportunities, strategic partnerships, and private access. Visible only to verified members.",
    accent: "#C4A84A",
    img: "https://images.pexels.com/photos/941861/pexels-photo-941861.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
  {
    href: "/pitches",
    eyebrow: "VIP Sessions",
    title: "Pitch Sessions",
    text: "Pitch directly to VIP investors and operators. Each pitch is reviewed personally — no cold emails.",
    accent: "#7B5EA7",
    img: "https://images.pexels.com/photos/3153201/pexels-photo-3153201.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
  {
    href: "/request-access",
    eyebrow: "Membership",
    title: "Apply",
    text: "Access is curated, not purchased. Share your profile — we assess fit within 48 hours.",
    accent: "#B87333",
    img: "https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
  },
];

const vipBenefits = [
  {
    icon: "◆",
    title: "Exclusive Deal Flow",
    text: "VIP members receive curated off-market deal introductions — real estate, venture, and hospitality opportunities that never surface publicly.",
    accent: "#D4A84A",
  },
  {
    icon: "⬡",
    title: "Receive Pitch Requests",
    text: "Ambitious founders and operators pay credits to pitch to you. Review on your schedule. Accept to earn credits. Decline with one tap.",
    accent: "#7B5EA7",
  },
  {
    icon: "●",
    title: "Private Circle Rooms",
    text: "Access invite-only conversation rooms for senior operators. Share intelligence. Co-create. Discuss what cannot be said in open networks.",
    accent: "#3B6FA8",
  },
  {
    icon: "★",
    title: "Premium Visibility",
    text: "Your listing appears first in marketplace searches. VIP nodes pulse gold in the network map. Your profile signals authority from the first impression.",
    accent: "#C4973A",
  },
  {
    icon: "◉",
    title: "Trust Amplification",
    text: "VIP status multiplies your trust score. Every introduction, every listing, every pitch carries the weight of verified, serious operating history.",
    accent: "#4A7C59",
  },
  {
    icon: "◈",
    title: "Balearic Legacy Network",
    text: "Connect with the people who actually move real estate, hospitality, and capital across Mallorca, Ibiza, and Menorca — privately.",
    accent: "#B87333",
  },
];

export default function HomePage() {
  return (
    <main className="app-shell lg:with-ai-rail" style={{ paddingTop: 0 }}>
      <TopNav />

      {/* ── Full Viewport Hero ───────────────────────────────────── */}
      <section
        className="relative mt-3 overflow-hidden rounded-[2rem]"
        style={{ minHeight: "92vh" }}
      >
        <img
          src="https://images.pexels.com/photos/4388167/pexels-photo-4388167.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1200&dpr=1"
          alt="Balearic Islands"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "brightness(0.26) saturate(0.70)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(165deg, rgba(12,11,9,0.08) 0%, rgba(12,11,9,0.52) 50%, rgba(12,11,9,0.97) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 68% 38%, rgba(196,151,58,0.07) 0%, transparent 58%)",
          }}
        />

        <div
          className="relative flex flex-col justify-end px-7 pb-14 sm:px-12 sm:pb-20 lg:px-14"
          style={{ minHeight: "92vh" }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span style={{ display: "inline-block", width: "2rem", height: "1px", background: "var(--gold)", flexShrink: 0 }} />
            <p className="text-[10px] uppercase tracking-[0.40em]" style={{ color: "var(--gold)" }}>
              Balea Sphere &middot; Balearic Private Network
            </p>
          </div>

          <h1
            className="max-w-4xl"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3.2rem, 8.5vw, 7.6rem)",
              color: "var(--champagne)",
              letterSpacing: "-0.015em",
              lineHeight: 0.98,
            }}
          >
            The room where<br />
            serious ambition<br />
            <span className="text-gradient-gold">finds its mirror.</span>
          </h1>

          <p
            className="mt-8 max-w-2xl leading-relaxed"
            style={{ fontSize: "clamp(0.95rem, 2vw, 1.15rem)", color: "rgba(237,229,208,0.76)" }}
          >
            Not every opportunity announces itself. The most consequential
            connections form quietly among operators who recognise each other,
            trust each other, and create together. Balea Sphere is that room.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/request-access" className="btn-primary premium-button rounded-[12px] px-8 py-3.5 text-sm">
              Request Private Access
            </Link>
            <Link href="/workspace" className="btn-quiet rounded-[12px] px-8 py-3.5 text-sm">
              Member Sign In
            </Link>
          </div>

          <div
            className="mt-14 flex flex-wrap items-center gap-5"
            style={{ fontSize: "10px", letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(237,229,208,0.28)" }}
          >
            <span>Mallorca</span>
            <span style={{ display: "inline-block", width: "1px", height: "12px", background: "rgba(196,151,58,0.28)" }} />
            <span>Ibiza</span>
            <span style={{ display: "inline-block", width: "1px", height: "12px", background: "rgba(196,151,58,0.28)" }} />
            <span>Menorca</span>
            <span style={{ display: "inline-block", width: "1px", height: "12px", background: "rgba(196,151,58,0.28)" }} />
            <span>Members Only</span>
          </div>
        </div>
      </section>

      {/* ── Manifesto Strip ──────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", textAlign: "center" }}>
          <div className="divider-gold" style={{ marginBottom: "3.5rem" }} />
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.5rem, 3.5vw, 2.6rem)",
              color: "var(--champagne)",
              lineHeight: 1.35,
              letterSpacing: "-0.005em",
            }}
          >
            A small, high-trust circle always outperforms<br />
            a large, noisy network.
            <br />
            <span className="text-gradient-gold">We enforce this by design.</span>
          </p>
          <div className="divider-gold" style={{ marginTop: "3.5rem" }} />
        </div>
      </section>

      {/* ── Value Pillars ─────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Curated Membership",
            text: "Every member is assessed for genuine relevance to the Balearic ecosystem. There is no shortcut to entry.",
            accent: "#C4973A",
          },
          {
            title: "Signal over Volume",
            text: "A focused circle of high-trust operators creates more value than any open network. Quality is enforced, not hoped for.",
            accent: "#3B6FA8",
          },
          {
            title: "Intentional Access",
            text: "Credits ensure every introduction carries weight. Low-effort contact has no currency here. Each connection is an investment.",
            accent: "#4A7C59",
          },
        ].map((p) => (
          <article key={p.title} className="surface-elevated rounded-[1.4rem] p-6">
            <div className="mb-4 h-px w-8" style={{ background: p.accent }} />
            <h3 className="text-xl leading-snug" style={{ fontFamily: "var(--font-display)", color: "var(--champagne)" }}>
              {p.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {p.text}
            </p>
          </article>
        ))}
      </section>

      {/* ── VIP Section ───────────────────────────────────────────── */}
      <section className="mt-3 surface-stage rounded-[2rem] p-8 sm:p-12">
        <div className="mb-2 flex items-center gap-2">
          <span className="vip-badge">VIP Access</span>
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 5vw, 3.8rem)",
            color: "var(--champagne)",
            lineHeight: 1.0,
            letterSpacing: "-0.01em",
          }}
        >
          Why serious operators<br />
          <span className="text-gradient-gold">choose VIP status.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          VIP membership is not a label — it is an operating advantage. Automatically granted when your
          verified annual revenue exceeds €1 million, it unlocks capabilities that turn the network
          into a private deal engine, a curated pitch funnel, and a trusted intelligence layer.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vipBenefits.map((b) => (
            <div
              key={b.title}
              className="rounded-[1.2rem] p-5 transition-all"
              style={{
                background: "rgba(255,248,235,0.022)",
                border: `1px solid ${b.accent}28`,
              }}
            >
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-base"
                style={{ background: `${b.accent}18`, color: b.accent, border: `1px solid ${b.accent}30` }}
              >
                {b.icon}
              </div>
              <h3 className="text-base font-semibold leading-snug" style={{ color: "var(--champagne)" }}>
                {b.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {b.text}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/request-access" className="btn-primary premium-button rounded-xl px-7 py-3 text-sm">
            Apply for Membership
          </Link>
          <Link href="/guide" className="btn-quiet rounded-xl px-6 py-3 text-sm">
            Learn about VIP →
          </Link>
        </div>
      </section>

      {/* ── Pitch Sessions Feature ────────────────────────────────── */}
      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-[1.8rem] p-8 sm:p-10"
          style={{
            background: "linear-gradient(145deg, rgba(123,94,167,0.12), rgba(60,30,90,0.08))",
            border: "1px solid rgba(123,94,167,0.28)",
          }}
        >
          <span
            className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-4"
            style={{ background: "rgba(123,94,167,0.18)", border: "1px solid rgba(123,94,167,0.38)", color: "#C4A8E8" }}
          >
            New · Pitch Sessions
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              color: "var(--champagne)",
              lineHeight: 1.0,
            }}
          >
            Pitch directly<br />
            <span className="text-gradient-amethyst">to VIP members.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Spend 25 credits to send a structured pitch to any VIP member. They decide on their own timeline. If they accept — a private thread opens automatically.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            VIPs earn credits for every accepted pitch. The circle rewards engagement, not just status.
          </p>
          <Link href="/pitches" className="btn-vip mt-6 inline-flex rounded-xl px-7 py-3 text-sm">
            Open Pitch Studio →
          </Link>
        </div>

        <div
          className="rounded-[1.8rem] p-8 sm:p-10"
          style={{
            background: "linear-gradient(145deg, rgba(59,111,168,0.10), rgba(20,40,70,0.08))",
            border: "1px solid rgba(59,111,168,0.24)",
          }}
        >
          <span
            className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-4"
            style={{ background: "rgba(59,111,168,0.16)", border: "1px solid rgba(59,111,168,0.32)", color: "#8AB4D8" }}
          >
            Private Rooms
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              color: "var(--champagne)",
              lineHeight: 1.0,
            }}
          >
            Circle-only<br />
            conversations.
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Private rooms where senior members share intelligence, co-structure deals, and discuss what cannot be said in open networks.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Room access requires the correct access level. Some rooms are hidden until unlocked.
          </p>
          <Link href="/messages" className="btn-secondary premium-button mt-6 inline-flex rounded-xl px-7 py-3 text-sm">
            View Messages →
          </Link>
        </div>
      </section>

      {/* ── Section Cards ─────────────────────────────────────────── */}
      <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative overflow-hidden rounded-[1.5rem] transition-transform hover:-translate-y-0.5"
            style={{ minHeight: "280px" }}
          >
            <img
              src={item.img}
              alt={item.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              style={{ filter: "brightness(0.24) saturate(0.60)" }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(12,11,9,0.98) 0%, rgba(12,11,9,0.30) 55%, transparent 100%)" }}
            />
            <div
              className="relative flex h-full flex-col justify-end p-6"
              style={{ minHeight: "280px" }}
            >
              <div className="mb-2 h-px w-5" style={{ background: item.accent, opacity: 0.80 }} />
              <p className="text-[10px] uppercase tracking-[0.30em]" style={{ color: item.accent }}>
                {item.eyebrow}
              </p>
              <h3 className="mt-2 text-2xl leading-tight" style={{ fontFamily: "var(--font-display)", color: "var(--champagne)" }}>
                {item.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(237,229,208,0.70)" }}>
                {item.text}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: item.accent }}>Enter →</span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <section
        className="mt-6 flex flex-wrap items-center justify-between gap-3 px-1 text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>Balea Sphere</p>
        <p>
          Questions?{" "}
          <a href="mailto:management@balea-sphere8.com" className="underline" style={{ color: "var(--subdued)" }}>
            management@balea-sphere8.com
          </a>
        </p>
      </section>
    </main>
  );
}
