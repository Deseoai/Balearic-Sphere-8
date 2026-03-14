"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../lib/api";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  location: string;
  category: string;
  whatOffer: string;
  whatSeek: string;
  whyJoin: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  status: "under_review" | "accepted" | "rejected" | "waitlisted";
  recommendedAccessLevel: string;
  aiPreScore: number;
  humanScore?: number;
  adminNotes?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type CircleUpgrade = {
  id: string;
  userId: string;
  circle: string;
  currentAccess: string;
  status: "under_review" | "approved" | "rejected" | "waitlisted";
  aiSuitability: number;
  reason: string;
  createdAt: string;
};

type AdminUser = {
  userId: string;
  email: string;
  displayName?: string;
  role: string;
  accessLevel: string;
  verificationStatus: "none" | "pending" | "verified" | "rejected";
  isElite?: boolean;
  isVip?: boolean;
  createdAt: string;
  updatedAt: string;
  magicLinksTotal: number;
  magicLinksActive: number;
  lastMagicLinkAt?: string;
  lastMagicLinkUsedAt?: string;
  lastMagicLinkExpiresAt?: string;
};

type MagicLinkRow = {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  requestedIp?: string;
  requestedUserAgent?: string;
};

type IssuedMagicLink = {
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  magicLinkLabel: string;
  magicLinkUrl: string;
};

type ApiList<T> = {
  items: T[];
};

const SESSION_KEY = "balea_admin_session";

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message.trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    if (parsed.error === "invalid_payload") {
      return "Please check your inputs and try again.";
    }
    if (parsed.error === "unauthorized_admin" || parsed.error === "invalid_admin_password") {
      return "Admin password is invalid or session has expired.";
    }
    if (parsed.error === "application_not_found") {
      return "Application not found.";
    }
    if (parsed.error === "user_not_found") {
      return "User not found.";
    }
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
  } catch {
    // non-json
  }
  return raw.slice(0, 220);
}

function statusChipClass(status: string): string {
  const value = status.trim().toLowerCase();
  if (["accepted", "approved", "completed", "active", "verified"].includes(value)) {
    return "status-chip status-approved";
  }
  if (["rejected", "failed", "closed", "blocked"].includes(value)) {
    return "status-chip status-rejected";
  }
  if (["waitlisted", "on_hold", "onhold", "paused", "pending", "under_review"].includes(value)) {
    return "status-chip status-waitlisted";
  }
  return "status-chip status-under_review";
}

function fitTier(score: number): "strong" | "medium" | "weak" {
  if (score >= 76) return "strong";
  if (score >= 52) return "medium";
  return "weak";
}

function fitSummary(item: AccessRequest): string {
  const tier = fitTier(item.aiPreScore);
  if (tier === "strong") return "Strong fit signal. Candidate likely suitable for curated access.";
  if (tier === "medium") return "Moderate fit signal. Review motivation depth and Balearic relevance.";
  return "Weak fit signal. Candidate may need stronger contribution clarity before acceptance.";
}

function missingData(item: AccessRequest): string[] {
  const rows: string[] = [];
  if (!item.website && !item.linkedin && !item.instagram) rows.push("No public profile links provided");
  if ((item.whatOffer ?? "").trim().length < 40) rows.push("Contribution statement is short");
  if ((item.whatSeek ?? "").trim().length < 35) rows.push("Request goals need more specificity");
  if ((item.whyJoin ?? "").trim().length < 35) rows.push("Fit rationale needs stronger context");
  if ((item.location ?? "").trim().length < 3) rows.push("Location relevance not clearly stated");
  return rows;
}

function relevanceHint(item: AccessRequest): string {
  const location = (item.location ?? "").toLowerCase();
  if (["mallorca", "ibiza", "menorca", "formentera", "balear"].some((term) => location.includes(term))) {
    return "Balearic relevance appears clear from location context.";
  }
  return "Balearic relevance is not explicit. Request clarification before final decision.";
}

function magicStatus(row: MagicLinkRow): "active" | "expired" | "used" {
  if (row.usedAt) return "used";
  if (new Date(row.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

function normalizeExternalUrl(value: string): string {
  const clean = value.trim();
  if (!clean) return clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://${clean}`;
}

export function AdminConsole() {
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [reviewedBy, setReviewedBy] = useState("admin-console");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("Sign in with your admin password.");
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [upgrades, setUpgrades] = useState<CircleUpgrade[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [appSearch, setAppSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState<"all" | "under_review" | "accepted" | "rejected" | "waitlisted">("all");
  const [appSort, setAppSort] = useState<"newest" | "fit">("newest");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [openMagicFor, setOpenMagicFor] = useState<string | null>(null);
  const [magicLinksByUser, setMagicLinksByUser] = useState<Record<string, MagicLinkRow[]>>({});
  const [issuedLinksByUser, setIssuedLinksByUser] = useState<Record<string, IssuedMagicLink[]>>({});

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_KEY) ?? "";
    if (saved) {
      setSessionToken(saved);
    }
    setLoading(false);
  }, []);

  async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    headers.set("content-type", "application/json");
    if (sessionToken.trim()) {
      headers.set("authorization", `Bearer ${sessionToken.trim()}`);
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(text || `${response.status} ${response.statusText}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async function login(): Promise<void> {
    if (!password.trim()) return;
    setBusy(true);
    setErrorLine(null);
    try {
      const response = await adminFetch<{ sessionToken: string; expiresAt: string }>("/v1/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: password.trim() })
      });
      setSessionToken(response.sessionToken);
      window.localStorage.setItem(SESSION_KEY, response.sessionToken);
      setStatusLine(`Admin signed in. Session active until ${new Date(response.expiresAt).toLocaleString("en-GB")}.`);
      setPassword("");
      await refresh(response.sessionToken);
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not sign in."));
      setStatusLine("Admin sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  function logout(): void {
    setSessionToken("");
    window.localStorage.removeItem(SESSION_KEY);
    setAccessRequests([]);
    setUpgrades([]);
    setUsers([]);
    setMagicLinksByUser({});
    setIssuedLinksByUser({});
    setOpenMagicFor(null);
    setStatusLine("Signed out.");
    setErrorLine(null);
  }

  async function refresh(tokenOverride?: string): Promise<void> {
    const authToken = (tokenOverride ?? sessionToken).trim();
    if (!authToken) {
      setStatusLine("Sign in with your admin password.");
      return;
    }

    setBusy(true);
    setErrorLine(null);
    try {
      const fetchWith = async <T,>(path: string): Promise<T> => {
        const headers = new Headers({ "content-type": "application/json", authorization: `Bearer ${authToken}` });
        const response = await fetch(`${apiBaseUrl}${path}`, { headers });
        const text = await response.text().catch(() => "");
        if (!response.ok) {
          throw new Error(text || `${response.status} ${response.statusText}`);
        }
        return text ? (JSON.parse(text) as T) : ({} as T);
      };

      const [accessRes, upgradeRes, usersRes] = await Promise.all([
        fetchWith<ApiList<AccessRequest>>("/v1/admin/access-requests"),
        fetchWith<ApiList<CircleUpgrade>>("/v1/admin/circle-upgrades"),
        fetchWith<ApiList<AdminUser>>("/v1/admin/users?limit=800")
      ]);
      const accessItems = accessRes.items ?? [];
      setAccessRequests(accessItems);
      setUpgrades(upgradeRes.items ?? []);
      setUsers(usersRes.items ?? []);
      if (!selectedAppId && accessItems.length > 0) {
        setSelectedAppId(accessItems[0].id);
      }
      setStatusLine("Admin data synchronized.");
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not load admin data."));
      setStatusLine("Session expired or API unavailable.");
      setSessionToken("");
      window.localStorage.removeItem(SESSION_KEY);
    } finally {
      setBusy(false);
    }
  }

  async function decideApplication(id: string, status: "accepted" | "rejected" | "on_hold"): Promise<void> {
    setBusy(true);
    setErrorLine(null);
    try {
      await adminFetch(`/v1/admin/access-requests/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          status,
          reviewedBy: reviewedBy.trim() || "admin-console",
          adminNotes: decisionNote.trim() || undefined
        })
      });
      setStatusLine(`Application updated: ${status}.`);
      setDecisionNote("");
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not update application."));
    } finally {
      setBusy(false);
    }
  }

  async function decideUpgrade(id: string, status: "approved" | "rejected" | "on_hold"): Promise<void> {
    setBusy(true);
    setErrorLine(null);
    try {
      await adminFetch(`/v1/admin/circle-upgrades/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          status,
          reviewedBy: reviewedBy.trim() || "admin-console"
        })
      });
      setStatusLine(`Upgrade updated: ${status}.`);
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not update upgrade."));
    } finally {
      setBusy(false);
    }
  }

  async function quickApproveUser(user: AdminUser): Promise<void> {
    setBusy(true);
    setErrorLine(null);
    try {
      await adminFetch(`/v1/admin/users/${user.userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: "member",
          accessLevel: "curated",
          verificationStatus: "verified"
        })
      });
      setStatusLine(`User ${user.email} approved.`);
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not approve user."));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: AdminUser): Promise<void> {
    const ok = window.confirm(`Remove ${user.email} and all runtime data? This cannot be undone.`);
    if (!ok) return;

    setBusy(true);
    setErrorLine(null);
    try {
      await adminFetch(`/v1/admin/users/${user.userId}`, {
        method: "DELETE",
        body: JSON.stringify({ removedBy: reviewedBy.trim() || "admin-console" })
      });
      setStatusLine(`User ${user.email} removed.`);
      setMagicLinksByUser((current) => {
        const next = { ...current };
        delete next[user.userId];
        return next;
      });
      setIssuedLinksByUser((current) => {
        const next = { ...current };
        delete next[user.userId];
        return next;
      });
      if (openMagicFor === user.userId) {
        setOpenMagicFor(null);
      }
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not remove user."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleElite(user: AdminUser): Promise<void> {
    setBusy(true);
    setErrorLine(null);
    try {
      const newStatus = !user.isElite;
      await adminFetch(`/v1/admin/users/${user.userId}/elite`, {
        method: "PATCH",
        body: JSON.stringify({ isElite: newStatus })
      });
      setUsers(prev => prev.map(u => u.userId === user.userId ? { ...u, isElite: newStatus } : u));
      setStatusLine(`${user.displayName || user.email} ${newStatus ? "added to" : "removed from"} Inner Circle ✦`);
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not update Inner Circle status."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMagicLinks(user: AdminUser): Promise<void> {
    if (openMagicFor === user.userId) {
      setOpenMagicFor(null);
      return;
    }

    setOpenMagicFor(user.userId);
    if (magicLinksByUser[user.userId]) return;

    try {
      const response = await adminFetch<ApiList<MagicLinkRow>>(`/v1/admin/users/${user.userId}/magic-links?limit=80`);
      setMagicLinksByUser((current) => ({ ...current, [user.userId]: response.items ?? [] }));
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not load sign-in link history."));
    }
  }

  async function issueMagicLink(user: AdminUser): Promise<void> {
    setBusy(true);
    setErrorLine(null);
    try {
      const response = await adminFetch<{
        status: string;
        item: {
          userId: string;
          email: string;
          createdAt: string;
          expiresAt: string;
          status: string;
          magicLinkLabel: string;
        };
        magicLinkUrl: string;
      }>(`/v1/admin/users/${user.userId}/magic-links/issue`, {
        method: "POST",
        body: JSON.stringify({ redirectPath: "/workspace" })
      });

      const issued: IssuedMagicLink = {
        userId: response.item.userId,
        email: response.item.email,
        createdAt: response.item.createdAt,
        expiresAt: response.item.expiresAt,
        status: response.item.status,
        magicLinkLabel: response.item.magicLinkLabel,
        magicLinkUrl: response.magicLinkUrl
      };

      setIssuedLinksByUser((current) => ({
        ...current,
        [user.userId]: [issued, ...(current[user.userId] ?? [])].slice(0, 6)
      }));

      setStatusLine(`Sign-in link issued for ${user.email}.`);
      await refresh();
    } catch (error) {
      setErrorLine(friendlyError(error, "Could not issue sign-in link."));
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setStatusLine("Link copied.");
    } catch {
      setStatusLine("Copy failed. Please copy manually.");
    }
  }

  function requestMoreInfo(item: AccessRequest): void {
    const subject = encodeURIComponent(`Balea Sphere application follow-up (${item.name || item.email})`);
    const body = encodeURIComponent(
      `Hi ${item.name || "there"},\n\nThank you for your application. We need a few additional details before final review:\n- Clarify your strongest contribution to the network\n- Clarify your current goals in the Balearic ecosystem\n- Add one public profile or website link\n\nBest regards,\nBalea Sphere Management`
    );
    window.location.href = `mailto:${item.email}?subject=${subject}&body=${body}`;
  }

  useEffect(() => {
    if (!loading && sessionToken) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sessionToken]);

  const filteredApplications = useMemo(() => {
    const term = appSearch.trim().toLowerCase();
    return [...accessRequests]
      .filter((item) => (appStatusFilter === "all" ? true : item.status === appStatusFilter))
      .filter((item) => {
        if (!term) return true;
        return `${item.name} ${item.email} ${item.location} ${item.category} ${item.whatOffer} ${item.whatSeek} ${item.whyJoin}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        if (appSort === "fit") return b.aiPreScore - a.aiPreScore;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [accessRequests, appSearch, appStatusFilter, appSort]);

  const selectedApp = useMemo(
    () => filteredApplications.find((item) => item.id === selectedAppId) ?? filteredApplications[0] ?? null,
    [filteredApplications, selectedAppId]
  );

  const selectedAppMissing = useMemo(() => (selectedApp ? missingData(selectedApp) : []), [selectedApp]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => `${user.email} ${user.displayName ?? ""} ${user.role}`.toLowerCase().includes(term));
  }, [userSearch, users]);

  const relatedUser = useMemo(() => {
    if (!selectedApp?.email) return null;
    return users.find((user) => user.email.toLowerCase() === selectedApp.email.toLowerCase()) ?? null;
  }, [selectedApp, users]);

  function focusUserRow(userId: string): void {
    const node = document.getElementById(`user-${userId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.style.boxShadow = "0 0 0 2px rgba(15, 122, 117, 0.45)";
    window.setTimeout(() => {
      node.style.boxShadow = "";
    }, 1800);
  }

  if (loading) {
    return (
      <section className="surface-stage rounded-[1.6rem] p-6">
        <p className="text-sm text-muted">Loading admin console...</p>
      </section>
    );
  }

  if (!sessionToken) {
    return (
      <section className="surface-stage rounded-[1.6rem] p-6 sm:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-olive">Admin Access</p>
        <h1 className="mt-2 font-[var(--font-display)] text-4xl text-ink">Secure admin login</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Enter your admin password to run applications, user governance, and sign-in link operations in one place.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            className="w-full rounded-2xl border border-[#6c543e38] bg-white/70 px-3 py-2 text-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void login();
              }
            }}
          />
          <button onClick={() => void login()} disabled={busy || !password.trim()} className="accent-button premium-button rounded-2xl px-4 py-2 text-sm font-semibold">
            {busy ? "..." : "Sign in"}
          </button>
        </div>

        <p className="mt-3 text-sm text-muted">{statusLine}</p>
        {errorLine && <p className="mt-1 text-sm text-sun">{errorLine}</p>}
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface-stage rounded-[1.6rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-olive">Admin Control</p>
            <h1 className="mt-1 font-[var(--font-display)] text-4xl text-ink">Applications decision workbench</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Review applicants with full context, decide quickly, manage users cleanly, and issue readable sign-in links without technical token handling.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void refresh()} disabled={busy} className="accent-button premium-button rounded-xl px-4 py-2 text-sm font-semibold">
              {busy ? "..." : "Refresh"}
            </button>
            <button onClick={logout} className="soft-pill premium-button px-4 py-2 text-sm font-semibold">
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_0.7fr]">
          <input
            value={reviewedBy}
            onChange={(event) => setReviewedBy(event.target.value)}
            placeholder="Reviewed by"
            className="w-full rounded-2xl border border-[#6c543e38] bg-white/70 px-3 py-2 text-sm"
          />
          <input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search users"
            className="w-full rounded-2xl border border-[#6c543e38] bg-white/70 px-3 py-2 text-sm"
          />
        </div>

        <p className="mt-3 text-sm text-muted">{statusLine}</p>
        {errorLine && <p className="mt-1 text-sm text-sun">{errorLine}</p>}
      </section>

      <section className="panel-card rounded-[1.4rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Applications Inbox</p>
            <h2 className="mt-1 font-[var(--font-display)] text-3xl text-ink">Review queue ({filteredApplications.length})</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={appSearch}
              onChange={(event) => setAppSearch(event.target.value)}
              placeholder="Search applicants"
              className="rounded-xl border border-[#6c543e38] bg-white/75 px-3 py-2 text-sm"
            />
            <select
              value={appStatusFilter}
              onChange={(event) => setAppStatusFilter(event.target.value as typeof appStatusFilter)}
              className="rounded-xl border border-[#6c543e38] bg-white/75 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="under_review">Under review</option>
              <option value="accepted">Accepted</option>
              <option value="waitlisted">On hold</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={appSort}
              onChange={(event) => setAppSort(event.target.value as typeof appSort)}
              className="rounded-xl border border-[#6c543e38] bg-white/75 px-3 py-2 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="fit">Highest fit first</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
            {filteredApplications.length === 0 && <p className="text-sm text-muted">No applications match your current filters.</p>}
            {filteredApplications.map((item) => {
              const selected = selectedApp?.id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedAppId(item.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected ? "border-accent/45 bg-accent/10" : "border-[#6c543e2f] bg-white/72"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{item.name || item.email}</p>
                    <span className={statusChipClass(item.status)}>{titleCase(item.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{item.email}</p>
                  <p className="mt-1 text-xs text-muted">{item.location} · {titleCase(item.category)}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="soft-pill px-2 py-1">Fit {item.aiPreScore}</span>
                    <span className="text-muted">{new Date(item.createdAt).toLocaleDateString("en-GB")}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            {!selectedApp && (
              <article className="surface-utility rounded-2xl p-4">
                <p className="text-sm text-muted">Select an application to view complete details and decision actions.</p>
              </article>
            )}

            {selectedApp && (
              <article className="grid gap-3">
                <section className="surface-stage rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-muted">Application Detail</p>
                      <h3 className="mt-1 text-2xl font-semibold text-ink">{selectedApp.name || selectedApp.email}</h3>
                      <p className="mt-1 text-sm text-muted">{selectedApp.email} · {selectedApp.location}</p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>Submitted {new Date(selectedApp.createdAt).toLocaleString("en-GB")}</p>
                      <p className="mt-1">Fit score {selectedApp.aiPreScore}</p>
                    </div>
                  </div>

                    <div className="decision-bar sticky-mobile-cta mt-3 rounded-xl p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted">Decision Actions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => void decideApplication(selectedApp.id, "accepted")} disabled={busy} className="accent-button premium-button rounded-xl px-3 py-2 text-sm">
                        Approve
                      </button>
                      <button onClick={() => void decideApplication(selectedApp.id, "on_hold")} disabled={busy} className="soft-pill premium-button px-3 py-2 text-sm">
                        Hold
                      </button>
                      <button onClick={() => void decideApplication(selectedApp.id, "rejected")} disabled={busy} className="sun-button premium-button rounded-xl px-3 py-2 text-sm">
                        Reject
                      </button>
                      <button onClick={() => requestMoreInfo(selectedApp)} className="soft-pill premium-button px-3 py-2 text-sm">
                        Request more info
                      </button>
                      {relatedUser && (
                        <button
                          onClick={() => focusUserRow(relatedUser.userId)}
                          className="soft-pill premium-button px-3 py-2 text-sm"
                        >
                          Open related user
                        </button>
                      )}
                      {relatedUser && (
                        <button
                          onClick={() => void issueMagicLink(relatedUser)}
                          disabled={busy}
                          className="soft-pill premium-button px-3 py-2 text-sm"
                        >
                          Issue sign-in link
                        </button>
                      )}
                    </div>
                    <textarea
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      rows={2}
                      placeholder="Internal decision note"
                      className="mt-2 w-full rounded-xl border border-[#6c543e38] bg-white/75 px-3 py-2 text-sm"
                    />
                  </div>
                </section>

                <section className="panel-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Fit Summary</p>
                  <p className="mt-1 text-sm text-ink">{fitSummary(selectedApp)}</p>
                  <p className="mt-1 text-xs text-muted">{relevanceHint(selectedApp)}</p>
                  {relatedUser && (
                    <div className="mt-2 rounded-xl border border-[#0f7a7540] bg-[#0f7a7512] p-2 text-xs">
                      <p className="font-semibold text-ink">Related account found</p>
                      <p className="mt-1 text-muted">
                        {relatedUser.displayName || relatedUser.email} · {titleCase(relatedUser.role)} · {titleCase(relatedUser.accessLevel)}
                      </p>
                    </div>
                  )}
                  {selectedAppMissing.length > 0 && (
                    <div className="mt-2 rounded-xl border border-[#7f8fa533] bg-white/75 p-2 text-xs text-muted">
                      <p className="font-semibold text-ink">Missing information</p>
                      <ul className="mt-1 grid gap-1">
                        {selectedAppMissing.map((line) => (
                          <li key={line}>• {line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="panel-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Applicant Details</p>
                  <div className="app-detail-grid mt-2 sm:grid-cols-2">
                    <div className="app-detail-item">
                      <p className="app-detail-label">Category</p>
                      <p className="app-detail-value">{titleCase(selectedApp.category)}</p>
                    </div>
                    <div className="app-detail-item">
                      <p className="app-detail-label">Suggested Access</p>
                      <p className="app-detail-value">{titleCase(selectedApp.recommendedAccessLevel)}</p>
                    </div>
                    <div className="app-detail-item sm:col-span-2">
                      <p className="app-detail-label">What value they bring</p>
                      <p className="app-detail-value">{selectedApp.whatOffer || "-"}</p>
                    </div>
                    <div className="app-detail-item sm:col-span-2">
                      <p className="app-detail-label">What they are looking for</p>
                      <p className="app-detail-value">{selectedApp.whatSeek || "-"}</p>
                    </div>
                    <div className="app-detail-item sm:col-span-2">
                      <p className="app-detail-label">Why they fit</p>
                      <p className="app-detail-value">{selectedApp.whyJoin || "-"}</p>
                    </div>
                    <div className="app-detail-item sm:col-span-2">
                      <p className="app-detail-label">Contact links</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {selectedApp.website && (
                          <a href={normalizeExternalUrl(selectedApp.website)} target="_blank" rel="noreferrer" className="soft-pill px-2 py-1">
                            Website
                          </a>
                        )}
                        {selectedApp.linkedin && (
                          <a href={normalizeExternalUrl(selectedApp.linkedin)} target="_blank" rel="noreferrer" className="soft-pill px-2 py-1">
                            LinkedIn
                          </a>
                        )}
                        {selectedApp.instagram && (
                          <a href={normalizeExternalUrl(selectedApp.instagram)} target="_blank" rel="noreferrer" className="soft-pill px-2 py-1">
                            Instagram
                          </a>
                        )}
                        {!selectedApp.website && !selectedApp.linkedin && !selectedApp.instagram && <span className="text-muted">No links provided.</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Review Timeline</p>
                  <div className="mt-2 grid gap-2 text-xs text-muted">
                    <div className="surface-utility rounded-xl p-2">Submitted: {new Date(selectedApp.createdAt).toLocaleString("en-GB")}</div>
                    {selectedApp.reviewedAt && (
                      <div className="surface-utility rounded-xl p-2">
                        Reviewed: {new Date(selectedApp.reviewedAt).toLocaleString("en-GB")} · by {selectedApp.reviewedBy || "admin"}
                      </div>
                    )}
                  </div>
                </section>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="panel-card rounded-[1.4rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">User Management</p>
            <h2 className="mt-1 font-[var(--font-display)] text-3xl text-ink">Members and sign-in links ({filteredUsers.length})</h2>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {filteredUsers.length === 0 && <p className="text-sm text-muted">No users found.</p>}
          {filteredUsers.map((user) => {
            const magicOpen = openMagicFor === user.userId;
            const links = magicLinksByUser[user.userId] ?? [];
            const issued = issuedLinksByUser[user.userId] ?? [];
            return (
              <article id={`user-${user.userId}`} key={user.userId} className="surface-utility rounded-2xl p-3 transition-shadow">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{user.displayName || user.email}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    <span className="soft-pill px-2 py-1">{titleCase(user.role)}</span>
                    <span className="soft-pill px-2 py-1">{titleCase(user.accessLevel)}</span>
                    <span className="soft-pill px-2 py-1">{titleCase(user.verificationStatus)}</span>
                    {user.isElite && (
                      <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "rgba(196,151,58,0.18)", color: "#D4A84A", border: "1px solid rgba(196,151,58,0.40)" }}>✦ Inner Circle</span>
                    )}
                    {user.isVip && (
                      <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "rgba(196,151,58,0.10)", color: "#C4973A", border: "1px solid rgba(196,151,58,0.25)" }}>VIP</span>
                    )}
                  </div>
                </div>

                <p className="mt-1 text-xs text-muted">
                  Sign-in links: {user.magicLinksTotal} total · {user.magicLinksActive} active · Last issued: {user.lastMagicLinkAt ? new Date(user.lastMagicLinkAt).toLocaleString("en-GB") : "-"}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => void quickApproveUser(user)} disabled={busy} className="accent-button premium-button rounded-xl px-3 py-2 text-xs">
                    Quick approve
                  </button>
                  <button onClick={() => void issueMagicLink(user)} disabled={busy} className="soft-pill premium-button px-3 py-2 text-xs">
                    Issue sign-in link
                  </button>
                  <button onClick={() => void toggleMagicLinks(user)} className="soft-pill premium-button px-3 py-2 text-xs">
                    {magicOpen ? "Hide link history" : "Show link history"}
                  </button>
                  <button
                    onClick={() => void toggleElite(user)}
                    disabled={busy}
                    className="premium-button rounded-xl px-3 py-2 text-xs"
                    style={user.isElite
                      ? { background: "rgba(196,151,58,0.18)", color: "#D4A84A", border: "1px solid rgba(196,151,58,0.40)" }
                      : { background: "rgba(196,151,58,0.08)", color: "#C4973A", border: "1px solid rgba(196,151,58,0.20)" }
                    }
                  >
                    {user.isElite ? "Remove from Inner Circle" : "✦ Add to Inner Circle"}
                  </button>
                  <button onClick={() => void removeUser(user)} disabled={busy} className="sun-button premium-button rounded-xl px-3 py-2 text-xs">
                    Remove user
                  </button>
                </div>

                {issued.length > 0 && (
                  <div className="mt-2 rounded-xl border border-accent/30 bg-accent/10 p-2 text-xs text-[#1f5f5a]">
                    <p className="font-semibold text-ink">Latest generated link</p>
                    <p className="mt-1">{issued[0].magicLinkLabel}</p>
                    <p className="mt-1 text-[11px] text-muted">Created {new Date(issued[0].createdAt).toLocaleString("en-GB")}</p>
                    <p className="mt-1 text-[11px] text-muted">Expires {new Date(issued[0].expiresAt).toLocaleString("en-GB")}</p>
                    <p className="mt-1 text-[11px] text-muted">Status {titleCase(issued[0].status)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={issued[0].magicLinkUrl} target="_blank" rel="noreferrer" className="soft-pill px-2 py-1">
                        Open
                      </a>
                      <button onClick={() => void copyToClipboard(issued[0].magicLinkUrl)} className="soft-pill px-2 py-1">
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {magicOpen && (
                  <div className="mt-2 grid gap-2">
                    {links.length === 0 && <p className="text-xs text-muted">No sign-in links recorded for this user.</p>}
                    {links.map((row) => {
                      const status = magicStatus(row);
                      return (
                        <div key={row.id} className="rounded-xl border border-[#6c543e20] bg-white/80 p-2 text-xs text-muted">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-ink">Sign-in link issued {new Date(row.createdAt).toLocaleString("en-GB")}</p>
                            <span className={statusChipClass(status)}>{status}</span>
                          </div>
                          <p className="mt-1">Expires: {new Date(row.expiresAt).toLocaleString("en-GB")}</p>
                          <p>Used: {row.usedAt ? new Date(row.usedAt).toLocaleString("en-GB") : "not used"}</p>
                          <p className="mt-1 text-[11px]">Historic links are not reopenable for security. Issue a fresh link if needed.</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => void issueMagicLink(user)} disabled={busy} className="soft-pill px-2 py-1">
                              Regenerate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel-card rounded-[1.4rem] p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-ink">Circle upgrade requests ({upgrades.length})</h3>
        <div className="mt-3 grid gap-2">
          {upgrades.length === 0 && <p className="text-sm text-muted">No circle requests found.</p>}
          {upgrades.map((item) => (
            <article key={item.id} className="surface-utility rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{item.circle}</p>
                <span className={statusChipClass(item.status)}>{titleCase(item.status)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                User: {item.userId.slice(0, 8)}... · Current: {titleCase(item.currentAccess)} · Fit {item.aiSuitability}
              </p>
              <p className="mt-1 text-xs text-muted">{item.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => void decideUpgrade(item.id, "approved")} disabled={busy} className="accent-button premium-button rounded-xl px-2.5 py-1.5 text-xs">
                  Approve
                </button>
                <button onClick={() => void decideUpgrade(item.id, "on_hold")} disabled={busy} className="soft-pill premium-button px-2.5 py-1.5 text-xs">
                  Hold
                </button>
                <button onClick={() => void decideUpgrade(item.id, "rejected")} disabled={busy} className="sun-button premium-button rounded-xl px-2.5 py-1.5 text-xs">
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
