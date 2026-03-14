"use client";

import type { ApplicantCategory, IndustrySector } from "@mallorca/shared";
import { ApplicantCategories, IndustrySectors } from "@mallorca/shared";
import { useRef, useState, useEffect } from "react";
import { postJson } from "../lib/api";

const revenueOptions = [
  { value: "under_250k",        label: "Under €250,000" },
  { value: "250k_to_1m",        label: "€250,000 – €1,000,000" },
  { value: "1m_to_5m",          label: "€1 million – €5 million" },
  { value: "over_5m",           label: "Over €5 million" },
  { value: "prefer_not_to_say", label: "Prefer not to disclose" },
] as const;

const categories: Array<{ value: ApplicantCategory; label: string }> = ApplicantCategories.map(value => ({
  value,
  label: value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
}));

const industryLabels: Record<IndustrySector, string> = {
  technology:        "Technology & Software",
  real_estate:       "Real Estate & Property",
  hospitality:       "Hospitality & Tourism",
  finance:           "Finance & Banking",
  investment:        "Investment & Capital",
  fashion:           "Fashion & Luxury",
  yachting:          "Yachting & Marine",
  arts:              "Arts & Culture",
  wellness:          "Wellness & Health",
  consulting:        "Consulting & Advisory",
  legal:             "Legal & Compliance",
  media:             "Media & Communications",
  food_beverage:     "Food & Beverage",
  events:            "Events & Entertainment",
  jewelry:           "Jewellery & Watches",
  luxury_goods:      "Luxury Goods & Retail",
  aviation:          "Aviation & Private Jets",
  architecture:      "Architecture & Design",
  interior_design:   "Interior Design",
  construction:      "Construction & Development",
  sports:            "Sports & Recreation",
  education:         "Education & Training",
  healthcare:        "Healthcare & Life Sciences",
  agriculture:       "Agriculture & Food Production",
  crypto_blockchain: "Crypto & Blockchain",
  sustainability:    "Sustainability & Clean Energy",
  photography_film:  "Photography & Film",
  retail:            "Retail & E-Commerce",
  logistics:         "Logistics & Supply Chain",
  other:             "Other",
};

type SubmitState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; message: string; applicantId: string; level: string }
  | { type: "error"; message: string };

function friendlyError(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return "Submission failed. Please try again.";
  const raw = error.message.trim();
  try {
    const p = JSON.parse(raw) as { error?: string; message?: string };
    if (p.error === "invalid_payload") return "Please complete all required fields and try again.";
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  } catch { /* */ }
  if (raw === "Failed to fetch") return "Connection failed. Please try again in a moment.";
  return raw.slice(0, 180);
}

const G = {
  gold: "var(--gold)", champagne: "var(--champagne)",
  muted: "var(--text-secondary)", display: "var(--font-display)",
};

export function AccessRequestForm() {
  const [state, setState] = useState<SubmitState>({ type: "idle" });
  const [consentChecked, setConsentChecked] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!consentChecked) {
      setState({ type: "error", message: "Please agree to the data processing terms to submit your application." });
      return;
    }
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const payload = {
      name:          String(fd.get("name") || ""),
      email:         String(fd.get("email") || ""),
      location:      String(fd.get("location") || ""),
      category:      String(fd.get("category") || "other") as ApplicantCategory,
      industry:      (String(fd.get("industry") || "") || undefined) as IndustrySector | undefined,
      companyName:   String(fd.get("companyName") || ""),
      annualRevenue: String(fd.get("annualRevenue") || "") || undefined,
      referralCode:  String(fd.get("referralCode") || "") || undefined,
      whatOffer:     String(fd.get("whatOffer") || ""),
      whatSeek:      String(fd.get("whatSeek") || ""),
      whyJoin:       String(fd.get("whyJoin") || ""),
      website:       String(fd.get("website") || ""),
      linkedin:      String(fd.get("linkedin") || "") || undefined,
      instagram:     String(fd.get("instagram") || "") || undefined,
      consentGiven:  true as const,
    };
    setState({ type: "submitting" });
    try {
      const response = await postJson<{ id: string; message: string; recommendedAccessLevel: string }>("/v1/access-requests", payload);
      setState({ type: "success", message: response.message, applicantId: response.id, level: response.recommendedAccessLevel });
      form.reset();
    } catch (error) {
      setState({ type: "error", message: friendlyError(error) });
    }
  }

  /* ── Success ─────────────────────────────────────────────── */
  if (state.type === "success") {
    return (
      <div
        className="rounded-[1.6rem] p-8 sm:p-12 text-center"
        style={{ background: "rgba(196,151,58,0.05)", border: "1px solid rgba(196,151,58,0.22)" }}
      >
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "rgba(196,151,58,0.12)", border: "1px solid rgba(196,151,58,0.35)" }}
        >
          <span style={{ color: G.gold, fontSize: "1.5rem" }}>✓</span>
        </div>
        <h3
          className="text-2xl sm:text-3xl"
          style={{ fontFamily: G.display, color: G.champagne, lineHeight: 1.1 }}
        >
          Application Received
        </h3>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: G.muted }}>
          {state.message}
        </p>
        <div
          className="mx-auto mt-6 flex flex-wrap justify-center gap-6 rounded-xl p-4 text-xs"
          style={{ background: "rgba(255,248,235,0.025)", border: "1px solid rgba(196,151,58,0.12)", maxWidth: "400px" }}
        >
          <span style={{ color: G.muted }}>
            Reference:{" "}
            <span className="font-medium" style={{ color: G.champagne }}>
              {state.applicantId.slice(0, 12)}…
            </span>
          </span>
          <span style={{ color: G.muted }}>
            Suggested level:{" "}
            <span className="font-medium capitalize" style={{ color: G.champagne }}>
              {state.level.replaceAll("_", " ")}
            </span>
          </span>
        </div>
        <p className="mt-6 text-sm leading-relaxed" style={{ color: G.muted }}>
          Our curation team reviews all applications within 24–48 hours.<br />
          You will receive a decision by email.
        </p>
      </div>
    );
  }

  /* ── Form ─────────────────────────────────────────────────── */
  return (
    <div className="grid gap-6">

      {/* Prestige intro */}
      <div
        className="rounded-[1.4rem] p-6 sm:p-8"
        style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.14)" }}
      >
        <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>
          What we look for
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          {[
            {
              title: "Genuine Balearic relevance",
              text: "You operate, invest, or create within the Mallorca, Ibiza, or Menorca ecosystem — not as a tourist, but as a builder.",
            },
            {
              title: "A clear value proposition",
              text: "You bring something specific and rare: expertise, capital, relationships, or opportunity that the circle cannot easily find elsewhere.",
            },
            {
              title: "Mutual fit",
              text: "You seek meaningful collaboration, not exposure. Every introduction you make reflects on those who introduced you.",
            },
          ].map(item => (
            <div key={item.title}>
              <div className="mb-2 h-px w-6" style={{ background: G.gold }} />
              <p className="mb-1 text-xs font-semibold" style={{ color: G.champagne }}>{item.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: G.muted }}>{item.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed" style={{ color: "rgba(154,144,128,0.75)" }}>
          Specific, honest answers significantly increase approval speed. Generic applications are typically deferred. Your information is handled confidentially and shared only with the curation team.
        </p>
      </div>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5">

        {/* Name + Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name" name="name" placeholder="Your full name" required />
          <Field label="Email Address" name="email" type="email" placeholder="name@company.com" required />
        </div>

        {/* Company + Category */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company / Business Name" name="companyName" placeholder="Your company or brand name" />
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Category</span>
            <select name="category" defaultValue="founder" required className="field-control">
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>

        {/* Industry */}
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>Industry Sector</span>
          <select name="industry" className="field-control">
            <option value="">Select your industry…</option>
            {IndustrySectors.map(s => (
              <option key={s} value={s}>{industryLabels[s]}</option>
            ))}
          </select>
        </label>

        {/* Location + Revenue */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" name="location" placeholder="Mallorca / Ibiza / Menorca / Barcelona" required />
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              Annual Revenue <span style={{ opacity: 0.5 }}>(confidential)</span>
            </span>
            <select name="annualRevenue" className="field-control">
              <option value="">Select a range…</option>
              {revenueOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div
          className="rounded-xl px-4 py-3 text-xs leading-relaxed"
          style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.12)", color: "rgba(154,144,128,0.80)" }}
        >
          Revenue figures are strictly confidential and never shared with other members. We reserve the right to verify declared figures internally as part of our curation process.
        </div>

        <hr className="divider-gold" />

        {/* Key questions */}
        <Textarea
          label="What value do you bring to this circle?"
          name="whatOffer"
          placeholder="Describe your strongest and most specific contribution. Name sectors, deal types, relationships, or expertise. Be concrete — what can members gain from you that they cannot find elsewhere?"
          required
        />
        <Textarea
          label="What are you currently seeking?"
          name="whatSeek"
          placeholder="Describe your concrete current goals. Are you sourcing capital, partners, properties, operators, or strategic introductions? Precision matters here."
          required
        />
        <Textarea
          label="Why are you a strong fit for this private network?"
          name="whyJoin"
          placeholder="Explain your Balearic connection, track record, and why collaboration with you is relevant to a curated membership circle. Reference specific projects, relationships, or outcomes if possible."
          required
        />

        <hr className="divider-gold" />

        {/* Social / web */}
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
            Online Presence
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Website <span style={{ color: "var(--gold)" }}>*</span>
              </span>
              <input name="website" type="url" required placeholder="https://" className="field-control" />
            </label>
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                LinkedIn <span style={{ opacity: 0.5 }}>(optional)</span>
              </span>
              <input name="linkedin" type="url" placeholder="https://" className="field-control" />
            </label>
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                Instagram <span style={{ opacity: 0.5 }}>(optional)</span>
              </span>
              <input name="instagram" type="url" placeholder="https://" className="field-control" />
            </label>
          </div>
        </div>

        {/* Referral */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
            Referral <span style={{ opacity: 0.5 }}>(optional)</span>
          </p>
          <Field label="Referred by (email or code)" name="referralCode" placeholder="member@example.com or referral code" />
          <p className="mt-1 text-[10px]" style={{ color: "rgba(196,151,58,0.45)" }}>
            If an existing member referred you, enter their email or referral code here.
          </p>
        </div>

        {/* Consent */}
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={e => setConsentChecked(e.target.checked)}
              className="sr-only"
            />
            <div
              onClick={() => setConsentChecked(c => !c)}
              className="h-5 w-5 rounded flex items-center justify-center transition-colors"
              style={{
                background: consentChecked ? "rgba(196,151,58,0.25)" : "rgba(255,248,235,0.04)",
                border: `1.5px solid ${consentChecked ? "rgba(196,151,58,0.70)" : "rgba(196,151,58,0.25)"}`,
              }}
            >
              {consentChecked && <span style={{ color: "var(--gold)", fontSize: "0.7rem", lineHeight: 1 }}>✓</span>}
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: G.muted }}>
            I agree that Balea Sphere stores and processes my personal data for membership administration and network facilitation purposes, in accordance with the{" "}
            <a href="#data-protection" className="underline" style={{ color: G.gold }}>Privacy &amp; Data Protection Policy</a>.
            I understand I can request deletion of my data at any time via my account settings.
          </p>
        </label>

        {/* Error */}
        {state.type === "error" && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: "rgba(201,123,110,0.08)", border: "1px solid rgba(201,123,110,0.25)", color: "#e8b4ac" }}
          >
            {state.message}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={state.type === "submitting" || !consentChecked}
          className="btn-primary premium-button w-full rounded-xl px-5 py-4 text-sm disabled:opacity-50"
        >
          {state.type === "submitting" ? "Submitting your application…" : "Submit Application for Review"}
        </button>

        <p className="text-center text-xs" style={{ color: "rgba(154,144,128,0.55)" }}>
          Applications are reviewed within 24–48 hours. You will receive a direct response by email.
        </p>
      </form>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, required }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder} className="field-control" />
    </label>
  );
}

function Textarea({ label, name, placeholder, required }: {
  label: string; name: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <textarea name={name} rows={5} required={required} placeholder={placeholder} className="field-control text-sm" style={{ lineHeight: 1.65 }} />
    </label>
  );
}
