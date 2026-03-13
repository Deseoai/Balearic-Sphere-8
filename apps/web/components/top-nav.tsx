"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const supportEmail = "management@balea-sphere8.com";
const ADMIN_ROLES = ["admin", "super_admin", "moderator"];

const mainLinks = [
  { href: "/workspace",  label: "Workspace", mobile: "Space" },
  { href: "/network",    label: "Network",   mobile: "Map" },
  { href: "/messages",   label: "Messages",  mobile: "Chat" },
  { href: "/marketplace",label: "Market",    mobile: "Market" },
  { href: "/pitches",    label: "Pitches",   mobile: "Pitch" },
  { href: "/events",     label: "Events",    mobile: "Events" },
] as const;

const baseExtraLinksLoggedOut = [
  { href: "/guide",          label: "Guide" },
  { href: "/credits",        label: "Credits" },
  { href: "/request-access", label: "Apply" },
] as const;

const baseExtraLinksLoggedIn = [
  { href: "/guide",          label: "Guide" },
  { href: "/credits",        label: "Credits" },
  { href: "/credits?tab=referral", label: "Refer & Earn" },
] as const;

const adminLink = { href: "/admin", label: "Admin" } as const;
const settingsLink = { href: "/settings", label: "Settings" } as const;

function active(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AuthUser = {
  userId: string;
  email: string;
  displayName?: string;
  role: string;
  isVip?: boolean;
  isElite?: boolean;
  avatarUrl?: string;
};

function getInitials(user: AuthUser): string {
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

function getDisplayLabel(user: AuthUser): string {
  return user.displayName || user.email.split("@")[0];
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;
  const isAdminOnly = user?.userId === "admin";

  useEffect(() => { setOpen(false); setUserMenuOpen(false); }, [pathname]);

  const [hasAdminSession, setHasAdminSession] = useState(false);

  const loadUser = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("balea_session_token") : null;
    const adminToken = typeof window !== "undefined" ? localStorage.getItem("balea_admin_session") : null;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

    setHasAdminSession(!!adminToken);

    if (token && token.length >= 20) {
      fetch(`${base}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() as Promise<{ user?: AuthUser }> : null)
        .then(d => {
          if (d?.user) {
            setUser(d.user);
          } else if (adminToken) {
            setUser({ userId: "admin", email: "Admin Panel", displayName: "Admin Panel", role: "admin", isVip: false });
          }
        })
        .catch(() => {
          if (adminToken) {
            setUser({ userId: "admin", email: "Admin Panel", displayName: "Admin Panel", role: "admin", isVip: false });
          }
        });
    } else if (adminToken) {
      setUser({ userId: "admin", email: "Admin Panel", displayName: "Admin Panel", role: "admin", isVip: false });
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const handleLogout = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("balea_session_token") : null;
    const adminToken = typeof window !== "undefined" ? localStorage.getItem("balea_admin_session") : null;

    if (user?.userId === "admin" && !token) {
      // Admin-only session — just clear and redirect to admin panel
      localStorage.removeItem("balea_admin_session");
      setUser(null);
      setUserMenuOpen(false);
      router.push("/admin");
      return;
    }

    if (token) {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      try {
        await fetch(`${base}/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch { /* ignore */ }
      localStorage.removeItem("balea_session_token");
    }
    // Also clear admin session
    if (adminToken) localStorage.removeItem("balea_admin_session");
    setUser(null);
    setUserMenuOpen(false);
    router.push("/");
  }, [router, user]);

  const baseExtraLinks = user ? baseExtraLinksLoggedIn : baseExtraLinksLoggedOut;
  const isElite = user?.isElite ?? false;
  const eliteLink = { href: "/circle", label: "✦ Circle" } as const;
  const extraLinks = isAdmin
    ? [...baseExtraLinks, adminLink]
    : isElite
      ? [...baseExtraLinks, eliteLink]
      : baseExtraLinks;

  return (
    <>
      {/* ── Desktop / Tablet Header ──────────────────────────── */}
      <header
        className="sticky top-2 z-40 rounded-[1.2rem] sm:top-3"
        style={{
          background: "rgba(14, 13, 11, 0.82)",
          border: "1px solid rgba(196,151,58,0.16)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.40)",
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <img
              src="/logo_balear.png"
              alt="Balea Sphere"
              className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9"
              style={{ border: "1px solid rgba(196,151,58,0.35)" }}
            />
            <div>
              <p
                className="leading-none tracking-wide"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.3rem, 3vw, 1.7rem)",
                  color: "var(--champagne)",
                  letterSpacing: "0.04em",
                }}
              >
                Balea Sphere
              </p>
              <p
                className="hidden text-[9px] uppercase tracking-[0.28em] sm:block mt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Private Balearic Network
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden min-w-0 items-center gap-0 lg:flex">
            {mainLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-2.5 py-1.5 text-sm rounded-lg transition-colors"
                style={{
                  color: active(pathname, item.href) ? "var(--champagne)" : "var(--text-secondary)",
                  background: active(pathname, item.href) ? "rgba(196,151,58,0.10)" : "transparent",
                  fontWeight: active(pathname, item.href) ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            ))}

            <div className="mx-2 h-4 w-px" style={{ background: "rgba(196,151,58,0.20)" }} />

            {extraLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                style={{
                  color: active(pathname, item.href) ? "var(--gold)" : "var(--text-secondary)",
                  fontWeight: active(pathname, item.href) ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            ))}

            <a
              href={`mailto:${supportEmail}`}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              Support
            </a>

            <div className="mx-2 h-4 w-px" style={{ background: "rgba(196,151,58,0.20)" }} />

            {/* User Identity */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors"
                  style={{
                    background: userMenuOpen ? "rgba(196,151,58,0.12)" : "rgba(196,151,58,0.06)",
                    border: "1px solid rgba(196,151,58,0.22)",
                  }}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: "rgba(196,151,58,0.25)", color: "var(--gold)" }}
                    >
                      {getInitials(user)}
                    </div>
                  )}
                  <span className="max-w-[120px] truncate text-xs" style={{ color: "var(--champagne)" }}>
                    {getDisplayLabel(user)}
                  </span>
                  {isAdminOnly ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(201,123,110,0.22)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.40)" }}
                    >
                      Admin
                    </span>
                  ) : isAdmin && hasAdminSession ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(201,123,110,0.18)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.30)" }}
                    >
                      Admin ✦
                    </span>
                  ) : isAdmin ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(201,123,110,0.18)", color: "#E8A898", border: "1px solid rgba(201,123,110,0.30)" }}
                    >
                      Admin
                    </span>
                  ) : null}
                  {user.isVip && !isAdmin && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(196,151,58,0.15)", color: "var(--gold)", border: "1px solid rgba(196,151,58,0.28)" }}
                    >
                      VIP
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>&#9662;</span>
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-52 rounded-[1rem] p-2 z-50"
                    style={{
                      background: "rgba(14,13,11,0.96)",
                      border: "1px solid rgba(196,151,58,0.20)",
                      backdropFilter: "blur(20px)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.50)",
                    }}
                  >
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--champagne)" }}>
                        {user.displayName || "Member"}
                      </p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {user.email}
                      </p>
                    </div>
                    <div className="h-px my-1" style={{ background: "rgba(196,151,58,0.12)" }} />
                    {isAdminOnly ? (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                        style={{ color: "#E8A898" }}
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Open Admin Panel
                      </Link>
                    ) : (
                      <>
                        <Link
                          href="/settings"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-secondary)" }}
                          onClick={() => setUserMenuOpen(false)}
                        >
                          Profile &amp; Settings
                        </Link>
                        <Link
                          href="/workspace"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-secondary)" }}
                          onClick={() => setUserMenuOpen(false)}
                        >
                          My Workspace
                        </Link>
                      </>
                    )}
                    <div className="h-px my-1" style={{ background: "rgba(196,151,58,0.12)" }} />
                    <button
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                      style={{ color: "#E8A898" }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/workspace"
                className="rounded-xl px-4 py-1.5 text-xs"
                style={{
                  border: "1px solid rgba(196,151,58,0.35)",
                  color: "var(--gold)",
                  background: "rgba(196,151,58,0.06)",
                }}
              >
                Sign In
              </Link>
            )}
          </nav>

          {/* Mobile Right Side */}
          <div className="flex items-center gap-2 lg:hidden">
            {user ? (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: "rgba(196,151,58,0.20)", color: "var(--gold)", border: "1px solid rgba(196,151,58,0.30)" }}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : getInitials(user)}
              </div>
            ) : (
              <Link
                href="/request-access"
                className="hidden text-xs px-4 py-1.5 rounded-full sm:block"
                style={{ border: "1px solid rgba(196,151,58,0.35)", color: "var(--gold)" }}
              >
                Apply
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                border: "1px solid rgba(196,151,58,0.18)",
                color: "var(--text-secondary)",
                background: "transparent",
              }}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <nav
            className="mt-0 grid gap-1 px-4 pb-4 lg:hidden"
            style={{ borderTop: "1px solid rgba(196,151,58,0.10)", paddingTop: "12px", marginTop: "0" }}
          >
            {user && (
              <Link
                href="/settings"
                className="rounded-xl px-4 py-3 mb-1 flex items-center justify-between"
                style={{ background: "rgba(196,151,58,0.06)", border: "1px solid rgba(196,151,58,0.14)" }}
                onClick={() => setOpen(false)}
              >
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--champagne)" }}>
                    {user.displayName || "Member"}
                    {isAdmin && <span className="ml-2 text-[9px] uppercase tracking-wide" style={{ color: "#E8A898" }}>Admin</span>}
                    {user.isVip && !isAdmin && <span className="ml-2 text-[9px] uppercase tracking-wide" style={{ color: "var(--gold)" }}>VIP</span>}
                  </p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>{user.email}</p>
                </div>
                <span className="text-xs shrink-0 ml-3" style={{ color: "var(--text-secondary)" }}>Profile →</span>
              </Link>
            )}
            {[...mainLinks, ...extraLinks].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-4 py-2.5 text-sm"
                style={{
                  color: active(pathname, item.href) ? "var(--champagne)" : "var(--text-secondary)",
                  background: active(pathname, item.href) ? "rgba(196,151,58,0.08)" : "transparent",
                  border: active(pathname, item.href) ? "1px solid rgba(196,151,58,0.18)" : "1px solid transparent",
                }}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={`mailto:${supportEmail}`}
              className="rounded-xl px-4 py-2.5 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              Support
            </a>
            {user ? (
              <button
                onClick={() => void handleLogout()}
                className="mt-1 rounded-xl px-4 py-2.5 text-sm text-left"
                style={{ color: "#E8A898", border: "1px solid rgba(201,123,110,0.20)" }}
              >
                Sign Out
              </button>
            ) : (
              <Link
                href="/workspace"
                className="mt-1 rounded-xl px-4 py-2.5 text-sm text-center"
                style={{ border: "1px solid rgba(196,151,58,0.35)", color: "var(--gold)" }}
              >
                Sign In
              </Link>
            )}
          </nav>
        )}
      </header>

      {/* ── Mobile Bottom Nav ─────────────────────────────────── */}
      <nav
        className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-6 gap-0.5 rounded-[1rem] px-1 py-1.5 lg:hidden"
        style={{
          background: "rgba(14, 13, 11, 0.88)",
          border: "1px solid rgba(196,151,58,0.15)",
          backdropFilter: "blur(16px)",
        }}
      >
        {mainLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl px-1 py-2 text-center text-[10px] transition-colors"
            style={{
              color: active(pathname, item.href) ? "var(--champagne)" : "var(--text-secondary)",
              background: active(pathname, item.href) ? "rgba(196,151,58,0.10)" : "transparent",
              fontWeight: active(pathname, item.href) ? 600 : 400,
              letterSpacing: "0.01em",
            }}
          >
            {item.mobile}
          </Link>
        ))}
      </nav>
    </>
  );
}
