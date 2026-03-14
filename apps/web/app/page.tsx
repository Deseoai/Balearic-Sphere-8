"use client";

import Link from "next/link";
import { TopNav } from "../components/top-nav";
import { useLang } from "../lib/i18n";

export default function HomePage() {
  const { t } = useLang();

  const sections = [
    {
      href: "/workspace",
      eyebrow: t("landing.sectionWorkspaceEyebrow"),
      title: t("landing.sectionWorkspaceTitle"),
      text: t("landing.sectionWorkspaceText"),
      accent: "#C4973A",
      img: "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
    {
      href: "/network",
      eyebrow: t("landing.sectionNetworkEyebrow"),
      title: t("landing.sectionNetworkTitle"),
      text: t("landing.sectionNetworkText"),
      accent: "#3B6FA8",
      img: "https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
    {
      href: "/messages",
      eyebrow: t("landing.sectionMessagesEyebrow"),
      title: t("landing.sectionMessagesTitle"),
      text: t("landing.sectionMessagesText"),
      accent: "#4A7C59",
      img: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
    {
      href: "/marketplace",
      eyebrow: t("landing.sectionMarketplaceEyebrow"),
      title: t("landing.sectionMarketplaceTitle"),
      text: t("landing.sectionMarketplaceText"),
      accent: "#C4A84A",
      img: "https://images.pexels.com/photos/941861/pexels-photo-941861.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
    {
      href: "/pitches",
      eyebrow: t("landing.sectionPitchesEyebrow"),
      title: t("landing.sectionPitchesTitle"),
      text: t("landing.sectionPitchesText"),
      accent: "#7B5EA7",
      img: "https://images.pexels.com/photos/3153201/pexels-photo-3153201.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
    {
      href: "/request-access",
      eyebrow: t("landing.sectionApplyEyebrow"),
      title: t("landing.sectionApplyTitle"),
      text: t("landing.sectionApplyText"),
      accent: "#B87333",
      img: "https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=800&h=500&dpr=1",
    },
  ];

  const vipBenefits = [
    {
      icon: "◆",
      title: t("landing.vipBenefit1Title"),
      text: t("landing.vipBenefit1Text"),
      accent: "#D4A84A",
    },
    {
      icon: "⬡",
      title: t("landing.vipBenefit2Title"),
      text: t("landing.vipBenefit2Text"),
      accent: "#7B5EA7",
    },
    {
      icon: "●",
      title: t("landing.vipBenefit3Title"),
      text: t("landing.vipBenefit3Text"),
      accent: "#3B6FA8",
    },
    {
      icon: "★",
      title: t("landing.vipBenefit4Title"),
      text: t("landing.vipBenefit4Text"),
      accent: "#C4973A",
    },
    {
      icon: "◉",
      title: t("landing.vipBenefit5Title"),
      text: t("landing.vipBenefit5Text"),
      accent: "#4A7C59",
    },
    {
      icon: "◈",
      title: t("landing.vipBenefit6Title"),
      text: t("landing.vipBenefit6Text"),
      accent: "#B87333",
    },
  ];

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
              {t("landing.eyebrowLabel")}
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
            {t("landing.heroLine1")}<br />
            {t("landing.heroLine2")}<br />
            <span className="text-gradient-gold">{t("landing.heroGold")}</span>
          </h1>

          <p
            className="mt-8 max-w-2xl leading-relaxed"
            style={{ fontSize: "clamp(0.95rem, 2vw, 1.15rem)", color: "rgba(237,229,208,0.76)" }}
          >
            {t("landing.heroSubtext")}
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/request-access" className="btn-primary premium-button rounded-[12px] px-8 py-3.5 text-sm">
              {t("landing.ctaRequestAccess")}
            </Link>
            <Link href="/workspace" className="btn-quiet rounded-[12px] px-8 py-3.5 text-sm">
              {t("landing.ctaMemberSignIn")}
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
            <span>{t("landing.membersOnly")}</span>
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
            {t("landing.manifestoQuote")}
            <br />
            <span className="text-gradient-gold">{t("landing.manifestoGold")}</span>
          </p>
          <div className="divider-gold" style={{ marginTop: "3.5rem" }} />
        </div>
      </section>

      {/* ── Value Pillars ─────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: t("landing.pillar1Title"),
            text: t("landing.pillar1Text"),
            accent: "#C4973A",
          },
          {
            title: t("landing.pillar2Title"),
            text: t("landing.pillar2Text"),
            accent: "#3B6FA8",
          },
          {
            title: t("landing.pillar3Title"),
            text: t("landing.pillar3Text"),
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
          <span className="vip-badge">{t("landing.vipBadge")}</span>
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
          {t("landing.vipHeadingLine1")}<br />
          <span className="text-gradient-gold">{t("landing.vipHeadingGold")}</span>
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {t("landing.vipSubtext")}
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
            {t("landing.applyForMembership")}
          </Link>
          <Link href="/guide" className="btn-quiet rounded-xl px-6 py-3 text-sm">
            {t("landing.learnAboutVip")}
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
            {t("landing.pitchBadge")}
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              color: "var(--champagne)",
              lineHeight: 1.0,
            }}
          >
            {t("landing.pitchHeadingLine1")}<br />
            <span className="text-gradient-amethyst">{t("landing.pitchHeadingGold")}</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("landing.pitchText1")}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("landing.pitchText2")}
          </p>
          <Link href="/pitches" className="btn-vip mt-6 inline-flex rounded-xl px-7 py-3 text-sm">
            {t("landing.pitchCta")}
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
            {t("landing.roomsBadge")}
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              color: "var(--champagne)",
              lineHeight: 1.0,
            }}
          >
            {t("landing.roomsHeadingLine1")}<br />
            {t("landing.roomsHeadingLine2")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("landing.roomsText1")}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("landing.roomsText2")}
          </p>
          <Link href="/messages" className="btn-secondary premium-button mt-6 inline-flex rounded-xl px-7 py-3 text-sm">
            {t("landing.roomsCta")}
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
                <span className="text-xs font-medium" style={{ color: item.accent }}>{t("landing.sectionEnter")}</span>
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
          {t("landing.footerQuestions")}{" "}
          <a href="mailto:management@balea-sphere8.com" className="underline" style={{ color: "var(--subdued)" }}>
            management@balea-sphere8.com
          </a>
        </p>
      </section>
    </main>
  );
}
