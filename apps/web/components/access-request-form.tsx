"use client";

import type { ApplicantCategory, IndustrySector } from "@mallorca/shared";
import { ApplicantCategories, IndustrySectors } from "@mallorca/shared";
import { useRef, useState } from "react";
import { postJson } from "../lib/api";
import { useLang } from "../lib/i18n";

const categories: Array<{ value: ApplicantCategory; label: string }> = ApplicantCategories.map(value => ({
  value,
  label: value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
}));

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
  const { t } = useLang();
  const [state, setState] = useState<SubmitState>({ type: "idle" });
  const [consentChecked, setConsentChecked] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const revenueOptions = [
    { value: "under_250k",        label: t("revenue.under_250k") },
    { value: "250k_to_1m",        label: t("revenue.250k_to_1m") },
    { value: "1m_to_5m",          label: t("revenue.1m_to_5m") },
    { value: "over_5m",           label: t("revenue.over_5m") },
    { value: "prefer_not_to_say", label: t("revenue.prefer_not_to_say") },
  ];

  const industryLabels: Record<IndustrySector, string> = {
    technology:        t("industry.technology"),
    real_estate:       t("industry.real_estate"),
    hospitality:       t("industry.hospitality"),
    finance:           t("industry.finance"),
    investment:        t("industry.investment"),
    fashion:           t("industry.fashion"),
    yachting:          t("industry.yachting"),
    arts:              t("industry.arts"),
    wellness:          t("industry.wellness"),
    consulting:        t("industry.consulting"),
    legal:             t("industry.legal"),
    media:             t("industry.media"),
    food_beverage:     t("industry.food_beverage"),
    events:            t("industry.events"),
    jewelry:           t("industry.jewelry"),
    luxury_goods:      t("industry.luxury_goods"),
    aviation:          t("industry.aviation"),
    architecture:      t("industry.architecture"),
    interior_design:   t("industry.interior_design"),
    construction:      t("industry.construction"),
    sports:            t("industry.sports"),
    education:         t("industry.education"),
    healthcare:        t("industry.healthcare"),
    agriculture:       t("industry.agriculture"),
    crypto_blockchain: t("industry.crypto_blockchain"),
    sustainability:    t("industry.sustainability"),
    photography_film:  t("industry.photography_film"),
    retail:            t("industry.retail"),
    logistics:         t("industry.logistics"),
    other:             t("industry.other"),
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!consentChecked) {
      setState({ type: "error", message: t("applyForm.consentError") });
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

  /* ── Success Modal ───────────────────────────────────────── */
  const [modalOpen, setModalOpen] = useState(state.type === "success");
  // Sync modal open state when success arrives
  if (state.type === "success" && !modalOpen) {
    setModalOpen(true);
  }

  const successModal = state.type === "success" && modalOpen && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(12,11,9,0.80)", backdropFilter: "blur(8px)" }}
      onClick={() => setModalOpen(false)}
    >
      <div
        className="relative w-full max-w-md rounded-[1.8rem] p-8 sm:p-10 text-center"
        style={{
          background: "rgba(20,18,16,0.98)",
          border: "1px solid rgba(196,151,58,0.30)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.70)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={() => setModalOpen(false)}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-white/10"
          style={{ color: G.muted }}
        >
          ✕
        </button>

        {/* Icon */}
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "rgba(196,151,58,0.12)", border: "1px solid rgba(196,151,58,0.40)" }}
        >
          <span style={{ color: G.gold, fontSize: "1.7rem" }}>✓</span>
        </div>

        <h3
          className="text-2xl sm:text-3xl mb-3"
          style={{ fontFamily: G.display, color: G.champagne, lineHeight: 1.1 }}
        >
          {t("applyForm.successTitle")}
        </h3>

        <p className="text-sm leading-relaxed mb-5" style={{ color: G.muted }}>
          {state.message}
        </p>

        {/* Email reminder */}
        <div
          className="rounded-xl px-5 py-4 text-sm leading-relaxed mb-5"
          style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.20)" }}
        >
          <p className="font-semibold mb-1" style={{ color: G.champagne }}>
            📬 {t("applyForm.checkEmailTitle")}
          </p>
          <p style={{ color: G.muted }}>{t("applyForm.checkEmailBody")}</p>
          <p className="mt-2 text-xs" style={{ color: "rgba(196,151,58,0.65)" }}>
            {t("applyForm.checkSpamHint")}
          </p>
        </div>

        {/* Reference */}
        <div
          className="flex flex-wrap justify-center gap-4 rounded-xl p-3 text-xs mb-6"
          style={{ background: "rgba(255,248,235,0.02)", border: "1px solid rgba(196,151,58,0.10)" }}
        >
          <span style={{ color: G.muted }}>
            {t("applyForm.reference")}{" "}
            <span className="font-medium" style={{ color: G.champagne }}>
              {state.applicantId.slice(0, 12)}…
            </span>
          </span>
        </div>

        <button
          onClick={() => setModalOpen(false)}
          className="btn-primary premium-button w-full rounded-xl px-5 py-3 text-sm"
        >
          {t("applyForm.successGotIt")}
        </button>
      </div>
    </div>
  );

  /* ── Form ─────────────────────────────────────────────────── */
  return (
    <>
    {successModal}
    <div className="grid gap-6">

      {/* Prestige intro */}
      <div
        className="rounded-[1.4rem] p-6 sm:p-8"
        style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.14)" }}
      >
        <p className="text-[10px] uppercase tracking-[0.32em]" style={{ color: G.gold }}>
          {t("applyForm.whatWeLookFor")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          {[
            {
              title: t("applyForm.criteria1Title"),
              text: t("applyForm.criteria1Text"),
            },
            {
              title: t("applyForm.criteria2Title"),
              text: t("applyForm.criteria2Text"),
            },
            {
              title: t("applyForm.criteria3Title"),
              text: t("applyForm.criteria3Text"),
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
          {t("applyForm.formNote")}
        </p>
      </div>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5">

        {/* Name + Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("applyForm.fieldFullName")} name="name" placeholder={t("applyForm.fieldFullNamePlaceholder")} required />
          <Field label={t("applyForm.fieldEmail")} name="email" type="email" placeholder={t("applyForm.fieldEmailPlaceholder")} required />
        </div>

        {/* Company + Category */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("applyForm.fieldCompany")} name="companyName" placeholder={t("applyForm.fieldCompanyPlaceholder")} />
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>{t("applyForm.fieldCategory")}</span>
            <select name="category" defaultValue="founder" required className="field-control">
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>

        {/* Industry */}
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>{t("applyForm.fieldIndustrySector")}</span>
          <select name="industry" className="field-control">
            <option value="">{t("applyForm.fieldIndustryPlaceholder")}</option>
            {IndustrySectors.map(s => (
              <option key={s} value={s}>{industryLabels[s]}</option>
            ))}
          </select>
        </label>

        {/* Location + Revenue */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("applyForm.fieldLocation")} name="location" placeholder={t("applyForm.fieldLocationPlaceholder")} required />
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              {t("applyForm.fieldRevenue")} <span style={{ opacity: 0.5 }}>{t("applyForm.fieldRevenueConfidential")}</span>
            </span>
            <select name="annualRevenue" className="field-control">
              <option value="">{t("applyForm.fieldRevenuePlaceholder")}</option>
              {revenueOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div
          className="rounded-xl px-4 py-3 text-xs leading-relaxed"
          style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.12)", color: "rgba(154,144,128,0.80)" }}
        >
          {t("applyForm.revenueNote")}
        </div>

        <hr className="divider-gold" />

        {/* Key questions */}
        <Textarea
          label={t("applyForm.questionOffer")}
          name="whatOffer"
          placeholder={t("applyForm.questionOfferPlaceholder")}
          required
        />
        <Textarea
          label={t("applyForm.questionSeek")}
          name="whatSeek"
          placeholder={t("applyForm.questionSeekPlaceholder")}
          required
        />
        <Textarea
          label={t("applyForm.questionWhy")}
          name="whyJoin"
          placeholder={t("applyForm.questionWhyPlaceholder")}
          required
        />

        <hr className="divider-gold" />

        {/* Social / web */}
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
            {t("applyForm.onlinePresence")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                {t("applyForm.fieldWebsite")} <span style={{ color: "var(--gold)" }}>*</span>
              </span>
              <input name="website" type="url" required placeholder="https://" className="field-control" />
            </label>
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                {t("applyForm.fieldLinkedIn")} <span style={{ opacity: 0.5 }}>{t("applyForm.optional")}</span>
              </span>
              <input name="linkedin" type="url" placeholder="https://" className="field-control" />
            </label>
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
                {t("applyForm.fieldInstagram")} <span style={{ opacity: 0.5 }}>{t("applyForm.optional")}</span>
              </span>
              <input name="instagram" type="url" placeholder="https://" className="field-control" />
            </label>
          </div>
        </div>

        {/* Referral */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
            {t("applyForm.referral")} <span style={{ opacity: 0.5 }}>{t("applyForm.optional")}</span>
          </p>
          <Field label={t("applyForm.referralLabel")} name="referralCode" placeholder={t("applyForm.referralPlaceholder")} />
          <p className="mt-1 text-[10px]" style={{ color: "rgba(196,151,58,0.45)" }}>
            {t("applyForm.referralHint")}
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
            {t("applyForm.consentText").split("Privacy & Data Protection Policy").map((part, i, arr) =>
              i < arr.length - 1 ? (
                <span key={i}>
                  {part}
                  <a href="#data-protection" className="underline" style={{ color: G.gold }}>Privacy &amp; Data Protection Policy</a>
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
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
          {state.type === "submitting" ? t("applyForm.submittingButton") : t("applyForm.submitButton")}
        </button>

        <p className="text-center text-xs" style={{ color: "rgba(154,144,128,0.55)" }}>
          {t("applyForm.submitNote")}
        </p>
      </form>
    </div>
    </>
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
