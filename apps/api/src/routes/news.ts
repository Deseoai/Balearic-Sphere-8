import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { requireSession } from "../lib/authSession.js";
import { emitEventHub } from "../lib/n8nEvents.js";
import { getPool } from "../store/postgres.js";

const GOOGLE_RSS_URL = "https://news.google.com/rss/search?q=Baleares+Mallorca+Ibiza+business+real+estate&hl=en-US&gl=US&ceid=US:en&num=20";

async function fetchGoogleRssNews(): Promise<Array<{title: string; description: string; url: string; sourceName: string; publishedAt: string; imageUrl?: string}>> {
  try {
    const resp = await fetch(GOOGLE_RSS_URL, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const items: Array<{title: string; description: string; url: string; sourceName: string; publishedAt: string}> = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ?? item.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "Google News";
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ?? item.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      if (title && link) {
        items.push({ title: title.trim(), description: desc.replace(/<[^>]+>/g, "").trim().slice(0, 300), url: link.trim(), sourceName: source.trim(), publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
      }
      if (items.length >= 20) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchGoogleCustomSearchNews(query: string): Promise<Array<{title: string; description: string; url: string; sourceName: string; publishedAt: string; imageUrl?: string}>> {
  if (!env.GOOGLE_API_KEY || !env.GOOGLE_SEARCH_CX) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=10&sort=date`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const data = await resp.json() as { items?: Array<{title: string; snippet: string; link: string; displayLink: string; pagemap?: {cse_image?: Array<{src: string}>}; formattedUrl: string}> };
    return (data.items ?? []).map((item) => ({
      title: item.title,
      description: item.snippet?.slice(0, 300) ?? "",
      url: item.link,
      sourceName: item.displayLink,
      publishedAt: new Date().toISOString(),
      imageUrl: item.pagemap?.cse_image?.[0]?.src,
    }));
  } catch {
    return [];
  }
}

export async function registerNewsRoutes(app: FastifyInstance): Promise<void> {
  // List news (public, no auth required for members)
  app.get("/v1/news", async (request, reply) => {
    const query = request.query as { limit?: string; category?: string };
    const limit = Math.min(parseInt(query.limit ?? "30", 10), 100);
    const pool = getPool();
    if (!pool) {
      return reply.send({ news: [] });
    }
    const result = await pool.query(
      `SELECT id, title, description, image_url, source_name, url, published_at, category, is_google, created_at
       FROM app_news ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT $1`,
      [limit]
    );
    return reply.send({ news: result.rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      imageUrl: r.image_url,
      sourceName: r.source_name,
      url: r.url,
      publishedAt: r.published_at,
      category: r.category,
      isGoogle: r.is_google,
      createdAt: r.created_at,
    })) });
  });

  // Refresh news from Google (admin or cron via shared key)
  app.post("/v1/news/refresh", async (request, reply) => {
    const authHeader = request.headers["authorization"] ?? "";
    const sharedKey = env.MBH_APP_SHARED_KEY;
    const isAdmin = sharedKey && authHeader === `Bearer ${sharedKey}`;
    // Also allow admin session
    if (!isAdmin) {
      const session = await requireSession(request, reply);
      if (!session) return;
      if (session.role !== "admin" && session.role !== "super_admin") {
        return reply.status(403).send({ error: "forbidden" });
      }
    }
    const body = request.body as { query?: string } | null;
    const searchQuery = body?.query ?? "Baleares Mallorca Ibiza business economy real estate 2025";

    // Try Custom Search first, fallback to RSS
    let items = await fetchGoogleCustomSearchNews(searchQuery);
    if (items.length === 0) {
      items = await fetchGoogleRssNews();
    }

    if (items.length === 0) {
      return reply.send({ refreshed: 0, message: "no_results" });
    }

    const pool = getPool();
    if (!pool) return reply.send({ refreshed: 0 });

    let inserted = 0;
    for (const item of items) {
      try {
        const existing = await pool.query("SELECT id FROM app_news WHERE url = $1", [item.url]);
        if (existing.rows.length > 0) continue;
        await pool.query(
          `INSERT INTO app_news (id, title, description, image_url, source_name, url, published_at, category, is_google)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [randomUUID(), item.title, item.description, item.imageUrl ?? null, item.sourceName, item.url, item.publishedAt, "balearic", true]
        );
        inserted++;
      } catch { /* skip duplicates */ }
    }

    // Emit to n8n for Notion sync
    if (inserted > 0) {
      await emitEventHub({ source: "app-api", event: "news.google.fetched", data: { inserted, fetchedAt: new Date().toISOString(), query: searchQuery } });
    }

    return reply.send({ refreshed: inserted });
  });

  // Create manual news item (admin only)
  app.post("/v1/news", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== "admin" && session.role !== "super_admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const schema = z.object({
      title: z.string().min(4).max(500),
      description: z.string().max(1000).optional(),
      url: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
      sourceName: z.string().max(200).optional(),
      publishedAt: z.string().optional(),
      category: z.string().max(100).default("general"),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    const d = parsed.data;
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    const id = randomUUID();
    await pool.query(
      `INSERT INTO app_news (id, title, description, image_url, source_name, url, published_at, category, is_google)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
      [id, d.title, d.description ?? null, d.imageUrl ?? null, d.sourceName ?? "Balea Sphere", d.url ?? null, d.publishedAt ?? new Date().toISOString(), d.category]
    );
    await emitEventHub({ source: "app-api", event: "news.manual.created", data: { newsId: id, title: d.title, createdBy: session.userId } });
    const result = await pool.query("SELECT * FROM app_news WHERE id = $1", [id]);
    return reply.status(201).send({ news: result.rows[0] });
  });

  // Delete news item (admin only)
  app.delete("/v1/news/:id", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (session.role !== "admin" && session.role !== "super_admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const { id } = request.params as { id: string };
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    await pool.query("DELETE FROM app_news WHERE id = $1", [id]);
    return reply.send({ deleted: true });
  });
}
