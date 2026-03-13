"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl, getSessionToken } from "../lib/api";

const INDUSTRY_OPTIONS = [
  { value: "", label: "— Select Industry —" },
  { value: "real_estate", label: "Real Estate" },
  { value: "hospitality", label: "Hospitality & Tourism" },
  { value: "tech", label: "Technology" },
  { value: "finance", label: "Finance & Investment" },
  { value: "legal", label: "Legal & Consulting" },
  { value: "retail", label: "Retail & Commerce" },
  { value: "yachting", label: "Yachting & Marine" },
  { value: "wellness", label: "Wellness & Lifestyle" },
  { value: "media", label: "Media & Creative" },
  { value: "other", label: "Other" },
];

type AuthUser = {
  userId: string;
  email: string;
  displayName?: string;
  companyName?: string;
  industry?: string;
  role: string;
  isVip?: boolean;
  avatarUrl?: string;
};

const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
  display: "var(--font-display)",
};

async function apiGet<T>(path: string): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfileSettings() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Magic link re-request
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const hasAdminSession = typeof window !== "undefined" && !!localStorage.getItem("balea_admin_session");

  const loadUser = useCallback(async () => {
    const token = getSessionToken();
    if (!token) { setLoading(false); return; }
    try {
      const data = await apiGet<{ user: AuthUser }>("/v1/auth/me");
      setUser(data.user);
      setDisplayName(data.user.displayName ?? "");
      setCompanyName(data.user.companyName ?? "");
      setIndustry(data.user.industry ?? "");
    } catch {
      setErrorMsg("Could not load profile. Please sign in again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUser(); }, [loadUser]);

  const handleSaveProfile = async () => {
    setSaving(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      const data = await apiPatch<{ user: AuthUser }>("/v1/auth/me", {
        displayName: displayName.trim() || undefined,
        companyName: companyName.trim(),
        industry: industry || undefined,
      });
      setUser(data.user);
      setSuccessMsg("Profile updated successfully.");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3_000_000) {
      setErrorMsg("Photo must be under 3MB. Please choose a smaller file."); return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"] as const;
    if (!allowed.includes(file.type as (typeof allowed)[number])) {
      setErrorMsg("Please upload a JPG, PNG, or WebP image."); return;
    }

    setUploadingAvatar(true); setErrorMsg(null);
    try {
      const base64 = await fileToBase64(file);
      setAvatarPreview(base64);
      const data = await apiPost<{ avatarUrl: string; user: AuthUser }>("/v1/auth/avatar", {
        imageBase64: base64,
        mimeType: file.type,
      });
      setUser(data.user);
      setSuccessMsg("Profile photo updated.");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to upload photo.");
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRequestMagicLink = async () => {
    const email = magicLinkEmail.trim() || user?.email;
    if (!email) { setErrorMsg("Please enter your email address."); return; }
    setSendingMagicLink(true); setErrorMsg(null);
    try {
      await apiPost("/v1/auth/request-magic-link", { email, redirectPath: "/workspace" });
      setMagicLinkSent(true);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send magic link.");
    } finally {
      setSendingMagicLink(false);
    }
  };

  const handleLogout = async () => {
    const token = getSessionToken();
    if (token) {
      try {
        await fetch(`${apiBaseUrl}/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch { /* ignore */ }
      localStorage.removeItem("balea_session_token");
    }
    localStorage.removeItem("balea_admin_session");
    router.push("/");
  };

  if (loading) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 text-center">
        <p className="text-sm" style={{ color: G.muted }}>Loading profile…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="surface-stage rounded-[1.8rem] p-8 sm:p-12">
        <h1 style={{ fontFamily: G.display, fontSize: "clamp(2rem,4vw,3rem)", color: G.champagne }}>
          Sign in to access settings
        </h1>
        <p className="mt-3 text-sm" style={{ color: G.muted }}>
          Request a magic link to sign in to your account.
        </p>
        <div className="mt-6 flex gap-3 flex-wrap">
          <input
            type="email"
            value={magicLinkEmail}
            onChange={e => setMagicLinkEmail(e.target.value)}
            placeholder="your@email.com"
            className="field-control max-w-xs"
          />
          <button
            onClick={() => void handleRequestMagicLink()}
            disabled={sendingMagicLink}
            className="btn-primary premium-button rounded-xl px-6 py-3 text-sm disabled:opacity-50"
          >
            {sendingMagicLink ? "Sending…" : "Request Magic Link"}
          </button>
        </div>
        {magicLinkSent && <p className="mt-3 text-sm" style={{ color: "#a0c890" }}>Magic link sent! Check your inbox.</p>}
        {errorMsg && <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{errorMsg}</p>}
      </section>
    );
  }

  const currentAvatar = avatarPreview || user.avatarUrl;
  const initials = user.displayName
    ? user.displayName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="grid gap-5">

      {/* Header */}
      <section className="surface-stage rounded-[1.8rem] p-6 sm:p-8">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-semibold mb-4"
          style={{ background: "rgba(196,151,58,0.12)", border: "1px solid rgba(196,151,58,0.28)", color: "var(--gold)" }}>
          Profile &amp; Settings
        </span>
        <div className="flex flex-wrap items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            {currentAvatar ? (
              <img src={currentAvatar} alt="Avatar" className="h-20 w-20 rounded-full object-cover"
                style={{ border: "2px solid rgba(196,151,58,0.35)" }} />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
                style={{ background: "rgba(196,151,58,0.15)", color: "var(--gold)", border: "2px solid rgba(196,151,58,0.30)" }}>
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-xs"
              style={{ background: "var(--obsidian)", border: "2px solid rgba(196,151,58,0.35)", color: "var(--gold)" }}
              title="Upload photo"
            >
              {uploadingAvatar ? "…" : "↑"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={e => void handleAvatarChange(e)} />
          </div>

          <div>
            <h1 style={{ fontFamily: G.display, fontSize: "clamp(1.8rem,3vw,2.4rem)", color: G.champagne, lineHeight: 1.1 }}>
              {user.displayName || "Your Profile"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: G.muted }}>{user.email}</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <span className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                style={{ background: "rgba(196,151,58,0.10)", border: "1px solid rgba(196,151,58,0.22)", color: "var(--gold)" }}>
                {user.role}
              </span>
              {user.isVip && (
                <span className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                  style={{ background: "rgba(212,168,74,0.15)", border: "1px solid rgba(212,168,74,0.30)", color: "#D4A84A" }}>
                  VIP
                </span>
              )}
            </div>
          </div>
        </div>

        {successMsg && <p className="mt-4 text-sm" style={{ color: "#a0c890" }}>{successMsg}</p>}
        {errorMsg && <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>{errorMsg}</p>}
      </section>

      {/* Edit Profile */}
      <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
        <p className="text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: G.muted }}>Profile Information</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              Display Name
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="field-control"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              Email Address
            </label>
            <input
              value={user.email}
              disabled
              className="field-control opacity-50 cursor-not-allowed"
              title="Email cannot be changed here"
            />
            <p className="mt-1 text-[11px]" style={{ color: G.muted }}>
              To change your email, contact support.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              Company / Business Name
            </label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Your company name"
              className="field-control"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.14em]" style={{ color: G.muted }}>
              Industry
            </label>
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              className="field-control"
            >
              {INDUSTRY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => void handleSaveProfile()}
            disabled={saving}
            className="btn-primary premium-button rounded-xl px-7 py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </section>

      {/* Session & Security */}
      <section className="surface-elevated rounded-[1.8rem] p-6 sm:p-8">
        <p className="text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: G.muted }}>Session &amp; Security</p>

        {hasAdminSession && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(201,123,110,0.08)", border: "1px solid rgba(201,123,110,0.22)" }}>
            <p className="text-sm font-semibold" style={{ color: "#E8A898" }}>Admin session active</p>
            <p className="mt-1 text-xs" style={{ color: G.muted }}>
              You are currently signed in with both a member session and an admin session.
              For security, only one identity should be active at a time.
            </p>
            <button
              onClick={() => {
                localStorage.removeItem("balea_admin_session");
                window.location.reload();
              }}
              className="mt-3 rounded-lg px-4 py-1.5 text-xs"
              style={{ border: "1px solid rgba(201,123,110,0.35)", color: "#E8A898" }}
            >
              Clear Admin Session
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl p-4" style={{ background: "rgba(196,151,58,0.04)", border: "1px solid rgba(196,151,58,0.12)" }}>
            <p className="text-sm font-semibold" style={{ color: G.champagne }}>Sign in with a new link</p>
            <p className="mt-1 text-xs mb-3" style={{ color: G.muted }}>
              Request a fresh magic link for your account.
            </p>
            {magicLinkSent ? (
              <p className="text-xs" style={{ color: "#a0c890" }}>Magic link sent to {user.email}!</p>
            ) : (
              <button
                onClick={() => void handleRequestMagicLink()}
                disabled={sendingMagicLink}
                className="btn-secondary rounded-xl px-5 py-2 text-xs disabled:opacity-50"
              >
                {sendingMagicLink ? "Sending…" : "Request Magic Link"}
              </button>
            )}
          </div>

          <div className="rounded-xl p-4" style={{ background: "rgba(201,123,110,0.04)", border: "1px solid rgba(201,123,110,0.12)" }}>
            <p className="text-sm font-semibold" style={{ color: "#E8B4BC" }}>Sign Out</p>
            <p className="mt-1 text-xs mb-3" style={{ color: G.muted }}>
              Revoke your current session and return to the homepage.
            </p>
            <button
              onClick={() => void handleLogout()}
              className="rounded-xl px-5 py-2 text-xs"
              style={{ border: "1px solid rgba(201,123,110,0.30)", color: "#E8A898" }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
