import Link from "next/link";
import { AccessRequestForm } from "../../components/access-request-form";
import { TopNav } from "../../components/top-nav";

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

export default function RequestAccessPage() {
  return (
    <main className="world-public app-shell lg:with-ai-rail">
      <TopNav />

      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-[2rem]" style={{ minHeight: "44vh" }}>
        <img
          src="https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=1920&h=700&dpr=1"
          alt="Luxury Balearic villa"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "brightness(0.28) saturate(0.75)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(12,11,9,0.20) 0%, rgba(12,11,9,0.90) 100%)" }}
        />
        <div className="relative flex h-full flex-col justify-end p-7 sm:p-10" style={{ minHeight: "44vh" }}>
          <Link href="/" className="text-xs underline mb-5" style={{ color: G.muted }}>← Back to home</Link>
          <p className="text-[10px] uppercase tracking-[0.36em]" style={{ color: G.gold }}>Membership Application</p>
          <h1
            className="mt-4 leading-tight"
            style={{ fontFamily: G.display, fontSize: "clamp(2.4rem,5vw,3.8rem)", color: G.champagne }}
          >
            Apply for private<br />Balearic access.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "rgba(237,229,208,0.65)" }}>
            Membership is curated for quality, not volume. Be specific about your contribution, your goals, and your Balearic connection.
          </p>
        </div>
      </section>

      {/* Info strip */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Review time", value: "24–48 hours" },
          { label: "Selection criteria", value: "Relevance & trust" },
          { label: "Questions?", value: "management@balea-sphere8.com", href: "mailto:management@balea-sphere8.com" },
        ].map(({ label, value, href }) => (
          <div
            key={label}
            className="rounded-xl p-4 text-center"
            style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.14)" }}
          >
            <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: G.muted }}>{label}</p>
            {href ? (
              <a href={href} className="mt-1 block text-sm underline" style={{ color: G.champagne }}>{value}</a>
            ) : (
              <p className="mt-1 text-sm font-medium" style={{ color: G.champagne }}>{value}</p>
            )}
          </div>
        ))}
      </section>

      {/* Form */}
      <section className="surface-elevated mt-4 rounded-[1.7rem] p-5 sm:p-7">
        <AccessRequestForm />
      </section>
    </main>
  );
}
