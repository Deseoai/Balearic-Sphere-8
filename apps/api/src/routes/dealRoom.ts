import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEventHub } from "../lib/n8nEvents.js";
import { getPool } from "../store/postgres.js";

const DEAL_ROOM_OPEN_COST = 20;

export async function registerDealRoomRoutes(app: FastifyInstance): Promise<void> {
  // List deal rooms for current user
  app.get("/v1/deal-rooms", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const pool = getPool();
    if (!pool) return reply.send({ dealRooms: [] });
    const result = await pool.query(
      `SELECT dr.id, dr.title, dr.description, dr.status, dr.created_by, dr.deal_value, dr.currency, dr.created_at, dr.updated_at,
              (SELECT COUNT(*) FROM app_deal_room_members WHERE room_id = dr.id) as member_count,
              (SELECT COUNT(*) FROM app_deal_room_messages WHERE room_id = dr.id) as message_count
       FROM app_deal_rooms dr
       JOIN app_deal_room_members m ON m.room_id = dr.id AND m.user_id = $1
       ORDER BY dr.updated_at DESC`,
      [session.userId]
    );
    return reply.send({ dealRooms: result.rows });
  });

  // Create deal room
  app.post("/v1/deal-rooms", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;
    const schema = z.object({
      title: z.string().min(4).max(200),
      description: z.string().max(2000).optional(),
      dealValue: z.number().min(0).optional(),
      currency: z.string().max(3).default("EUR"),
      inviteUserIds: z.array(z.string().uuid()).max(10).default([]),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    const d = parsed.data;
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });

    const now = new Date().toISOString();
    const roomId = randomUUID();
    await pool.query(
      `INSERT INTO app_deal_rooms (id, title, description, status, created_by, deal_value, currency, created_at, updated_at)
       VALUES ($1,$2,$3,'open',$4,$5,$6,$7,$7)`,
      [roomId, d.title, d.description ?? null, session.userId, d.dealValue ?? null, d.currency, now]
    );
    // Add creator as owner
    await pool.query(
      `INSERT INTO app_deal_room_members (id, room_id, user_id, display_name, avatar_url, role, joined_at)
       VALUES ($1,$2,$3,$4,$5,'owner',$6)`,
      [randomUUID(), roomId, session.userId, session.displayName ?? session.email, session.avatarUrl ?? null, now]
    );
    // Add invited members
    for (const uid of d.inviteUserIds) {
      try {
        const userRes = await pool.query("SELECT display_name, avatar_url FROM app_users WHERE id = $1", [uid]);
        if (userRes.rows.length > 0) {
          const u = userRes.rows[0];
          await pool.query(
            `INSERT INTO app_deal_room_members (id, room_id, user_id, display_name, avatar_url, role, joined_at)
             VALUES ($1,$2,$3,$4,$5,'collaborator',$6)
             ON CONFLICT (room_id, user_id) DO NOTHING`,
            [randomUUID(), roomId, uid, u.display_name, u.avatar_url, now]
          );
        }
      } catch { /* skip */ }
    }

    await emitEventHub({ source: "app-api", event: "deal_room.created", data: { roomId, title: d.title, createdBy: session.userId, memberCount: 1 + d.inviteUserIds.length } });

    const room = await pool.query("SELECT * FROM app_deal_rooms WHERE id = $1", [roomId]);
    return reply.status(201).send({ dealRoom: room.rows[0] });
  });

  // Get deal room detail with messages and members
  app.get("/v1/deal-rooms/:id", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    // Check membership
    const memCheck = await pool.query("SELECT id FROM app_deal_room_members WHERE room_id = $1 AND user_id = $2", [id, session.userId]);
    if (memCheck.rows.length === 0) {
      const isAdmin = session.role === "admin" || session.role === "super_admin";
      if (!isAdmin) return reply.status(403).send({ error: "not_a_member" });
    }
    const roomResult = await pool.query("SELECT * FROM app_deal_rooms WHERE id = $1", [id]);
    if (roomResult.rows.length === 0) return reply.status(404).send({ error: "not_found" });
    const members = await pool.query("SELECT * FROM app_deal_room_members WHERE room_id = $1 ORDER BY joined_at ASC", [id]);
    const messages = await pool.query("SELECT * FROM app_deal_room_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200", [id]);
    return reply.send({ dealRoom: roomResult.rows[0], members: members.rows, messages: messages.rows });
  });

  // Send message to deal room
  app.post("/v1/deal-rooms/:id/messages", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const schema = z.object({ content: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    const memCheck = await pool.query("SELECT id FROM app_deal_room_members WHERE room_id = $1 AND user_id = $2", [id, session.userId]);
    if (memCheck.rows.length === 0) return reply.status(403).send({ error: "not_a_member" });
    const msgId = randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO app_deal_room_messages (id, room_id, user_id, display_name, avatar_url, content, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [msgId, id, session.userId, session.displayName ?? session.email, session.avatarUrl ?? null, parsed.data.content, now]
    );
    await pool.query("UPDATE app_deal_rooms SET updated_at = $1 WHERE id = $2", [now, id]);
    const msg = await pool.query("SELECT * FROM app_deal_room_messages WHERE id = $1", [msgId]);
    return reply.status(201).send({ message: msg.rows[0] });
  });

  // Invite member to deal room
  app.post("/v1/deal-rooms/:id/members", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const schema = z.object({ userId: z.string().uuid() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    // Only owner can invite
    const ownerCheck = await pool.query("SELECT id FROM app_deal_room_members WHERE room_id = $1 AND user_id = $2 AND role = 'owner'", [id, session.userId]);
    if (ownerCheck.rows.length === 0) return reply.status(403).send({ error: "not_owner" });
    const userRes = await pool.query("SELECT display_name, avatar_url FROM app_users WHERE id = $1", [parsed.data.userId]);
    if (userRes.rows.length === 0) return reply.status(404).send({ error: "user_not_found" });
    const u = userRes.rows[0];
    await pool.query(
      `INSERT INTO app_deal_room_members (id, room_id, user_id, display_name, avatar_url, role, joined_at)
       VALUES ($1,$2,$3,$4,$5,'collaborator',now())
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [randomUUID(), id, parsed.data.userId, u.display_name, u.avatar_url]
    );
    return reply.send({ invited: true });
  });

  // Update deal room (status, title, value) - owner only
  app.patch("/v1/deal-rooms/:id", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().min(4).max(200).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(["open", "negotiating", "closed", "cancelled"]).optional(),
      dealValue: z.number().min(0).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const pool = getPool();
    if (!pool) return reply.status(503).send({ error: "db_unavailable" });
    const ownerCheck = await pool.query("SELECT id FROM app_deal_room_members WHERE room_id = $1 AND user_id = $2 AND role = 'owner'", [id, session.userId]);
    const isAdmin = session.role === "admin" || session.role === "super_admin";
    if (ownerCheck.rows.length === 0 && !isAdmin) return reply.status(403).send({ error: "not_owner" });
    const d = parsed.data;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (d.title !== undefined) { updates.push(`title = $${idx++}`); values.push(d.title); }
    if (d.description !== undefined) { updates.push(`description = $${idx++}`); values.push(d.description); }
    if (d.status !== undefined) { updates.push(`status = $${idx++}`); values.push(d.status); }
    if (d.dealValue !== undefined) { updates.push(`deal_value = $${idx++}`); values.push(d.dealValue); }
    updates.push(`updated_at = $${idx++}`); values.push(new Date().toISOString());
    values.push(id);
    if (updates.length > 1) {
      await pool.query(`UPDATE app_deal_rooms SET ${updates.join(", ")} WHERE id = $${idx}`, values);
    }
    const result = await pool.query("SELECT * FROM app_deal_rooms WHERE id = $1", [id]);
    return reply.send({ dealRoom: result.rows[0] });
  });
}
