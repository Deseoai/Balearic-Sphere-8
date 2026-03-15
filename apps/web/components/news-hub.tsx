"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type NewsItem = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  sourceName?: string;
  url?: string;
  publishedAt?: string;
  category?: string;
  isGoogle?: boolean;
  createdAt: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("balea_session_token") : null;
}
function getSessionUser() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("balea_session_user") : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function NewsHub() {
  const { t } = useLang();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", description: "", url: "", imageUrl: "", sourceName: "" });
  const [addLoading, setAddLoading] = useState(false);
  const sessionUser = getSessionUser();
  const isAdmin = sessionUser?.role === "admin" || sessionUser?.role === "super_admin";
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadNews() {
    try {
      const res = await fetch(`${API_BASE}/v1/news?limit=50`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setNews(data.news ?? []);
      setError("");
    } catch {
      setError(t("news.errorLoading"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const token = getToken();
      await fetch(`${API_BASE}/v1/news/refresh`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Baleares Mallorca Ibiza business real estate investment 2025" })
      });
      await loadNews();
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  }

  async function handleAddNews(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/v1/news`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: addForm.title, description: addForm.description || undefined, url: addForm.url || undefined, imageUrl: addForm.imageUrl || undefined, sourceName: addForm.sourceName || undefined })
      });
      if (res.ok) {
        setAddForm({ title: "", description: "", url: "", imageUrl: "", sourceName: "" });
        setShowAddForm(false);
        await loadNews();
      }
    } catch { /* ignore */ } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const token = getToken();
    await fetch(`${API_BASE}/v1/news/${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    setNews(prev => prev.filter(n => n.id !== id));
  }

  useEffect(() => {
    loadNews();
    intervalRef.current = setInterval(loadNews, 10 * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function formatDate(iso?: string) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
  }

  return (
    <div className="app-shell py-12 lg:with-ai-rail">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.2em] uppercase text-gold font-display mb-3">{t("news.eyebrow")}</p>
        <h1 className="font-display text-4xl md:text-5xl text-ink mb-4">{t("news.title")}</h1>
        <p className="text-muted text-sm max-w-xl">{t("news.subtext")}</p>
        <div className="flex items-center gap-3 mt-6 flex-wrap">
          {isAdmin && (
            <>
              <button onClick={handleRefresh} disabled={refreshing} className="btn-quiet text-xs px-4 py-2">
                {refreshing ? "…" : t("news.refreshNews")}
              </button>
              <button onClick={() => setShowAddForm(v => !v)} className="btn-quiet text-xs px-4 py-2">
                {t("news.addNews")}
              </button>
            </>
          )}
          <span className="text-muted text-[10px] tracking-wider uppercase">{t("news.googlePowered")}</span>
        </div>
      </div>

      {/* Admin Add Form */}
      {isAdmin && showAddForm && (
        <div className="panel-card-strong mb-8 p-6">
          <p className="text-ink text-sm font-display mb-4">{t("news.adminSection")}</p>
          <form onSubmit={handleAddNews} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-muted text-xs block mb-1">{t("news.titleField")} *</label>
              <input className="field-control w-full" required value={addForm.title} onChange={e => setAddForm(p => ({...p, title: e.target.value}))} />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">{t("news.sourceNameField")}</label>
              <input className="field-control w-full" value={addForm.sourceName} onChange={e => setAddForm(p => ({...p, sourceName: e.target.value}))} />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">{t("news.urlField")}</label>
              <input className="field-control w-full" type="url" value={addForm.url} onChange={e => setAddForm(p => ({...p, url: e.target.value}))} />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">{t("news.imageUrlField")}</label>
              <input className="field-control w-full" type="url" value={addForm.imageUrl} onChange={e => setAddForm(p => ({...p, imageUrl: e.target.value}))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-muted text-xs block mb-1">{t("news.descriptionField")}</label>
              <textarea className="field-control w-full" rows={3} value={addForm.description} onChange={e => setAddForm(p => ({...p, description: e.target.value}))} />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={addLoading} className="btn-primary px-6 py-2 text-sm">{t("news.publishButton")}</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="btn-quiet px-4 py-2 text-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted text-sm">{t("news.loadingNews")}</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">{error}</p>
          <button onClick={loadNews} className="btn-quiet mt-4 px-6 py-2 text-sm">{t("common.tryAgain")}</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && news.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted text-sm">{t("news.noNews")}</p>
          {isAdmin && (
            <button onClick={handleRefresh} className="btn-quiet mt-4 px-6 py-2 text-sm">{t("news.refreshNews")}</button>
          )}
        </div>
      )}

      {/* News Grid */}
      {!loading && news.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map(item => (
            <div key={item.id} className="panel-card group flex flex-col overflow-hidden">
              {/* Image */}
              {item.imageUrl && (
                <div className="h-44 w-full overflow-hidden bg-charcoal">
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
                {/* Source + Date */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gold text-[10px] tracking-widest uppercase font-display">{item.sourceName ?? "Balea Sphere"}</span>
                  <span className="text-muted text-[10px]">{formatDate(item.publishedAt ?? item.createdAt)}</span>
                </div>
                {/* Title */}
                <h3 className="text-ink font-display text-base leading-snug mb-2 line-clamp-3">{item.title}</h3>
                {/* Description */}
                {item.description && (
                  <p className="text-muted text-xs leading-relaxed mb-4 flex-1 line-clamp-3">{item.description}</p>
                )}
                {/* Actions */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-gold text-xs hover:text-gold-light transition-colors">
                      {t("news.readMore")}
                    </a>
                  ) : <span />}
                  {isAdmin && (
                    <button onClick={() => handleDelete(item.id)} className="text-muted hover:text-[#C97B6E] text-[10px] transition-colors">
                      {t("news.deleteNews")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
