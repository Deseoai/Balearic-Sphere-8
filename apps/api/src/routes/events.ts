import { EventTopics, type EventRecord } from "@mallorca/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireMemberWorkspaceAccess, requireSession } from "../lib/authSession.js";
import { emitEventHub } from "../lib/n8nEvents.js";
import {
  cancelEvent,
  cancelRsvp,
  getEventById,
  getUserRsvp,
  listEvents,
  rsvpEvent,
  saveEvent
} from "../store/index.js";

const createEventSchema = z.object({
  title: z.string().min(4).max(200),
  topic: z.enum(EventTopics),
  description: z.string().min(10).max(5000),
  location: z.string().min(2).max(300),
  address: z.string().max(400).optional(),
  link: z.string().url().optional().or(z.literal("")),
  dateTime: z.string().min(1),
  endTime: z.string().optional(),
  price: z.number().min(0).max(100000).default(0),
  currency: z.string().max(3).default("EUR"),
  maxAttendees: z.number().int().min(1).max(10000).optional(),
});

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  // List events
  app.get("/v1/events", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = request.query as { status?: string; mine?: "true" };
    const events = await listEvents({
      status: query.status || "published",
      postedBy: query.mine === "true" ? session.userId : undefined,
    });
    return reply.send({ events });
  });

  // Get single event with attendees
  app.get("/v1/events/:id", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const event = await getEventById(id);
    if (!event) return reply.status(404).send({ error: "event_not_found" });
    const isAttending = await getUserRsvp(id, session.userId);
    return reply.send({ event, isAttending });
  });

  // Create event
  app.post("/v1/events", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;
    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    const record: EventRecord = {
      id: randomUUID(),
      postedBy: session.userId,
      title: parsed.data.title,
      topic: parsed.data.topic,
      description: parsed.data.description,
      location: parsed.data.location,
      address: parsed.data.address,
      link: parsed.data.link || undefined,
      dateTime: parsed.data.dateTime,
      endTime: parsed.data.endTime,
      price: parsed.data.price,
      currency: parsed.data.currency,
      maxAttendees: parsed.data.maxAttendees,
      status: "published",
      createdAt: now,
      updatedAt: now,
    };
    const saved = await saveEvent(record);
    await emitEventHub({
      source: "app-api",
      event: "event.offline.created",
      data: {
        eventId: saved.id,
        postedBy: session.userId,
        postedByName: session.displayName ?? session.email,
        title: saved.title,
        topic: saved.topic,
        location: saved.location,
        dateTime: saved.dateTime,
        price: saved.price,
        currency: saved.currency,
        createdAt: now,
      },
    });
    return reply.status(201).send({ event: saved });
  });

  // RSVP to event
  app.post("/v1/events/:id/rsvp", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;
    const { id } = request.params as { id: string };
    const event = await getEventById(id);
    if (!event) return reply.status(404).send({ error: "event_not_found" });
    if (event.status !== "published") return reply.status(400).send({ error: "event_not_available" });
    if (event.maxAttendees && (event.rsvpCount ?? 0) >= event.maxAttendees) {
      return reply.status(400).send({ error: "event_full" });
    }
    const alreadyRsvped = await getUserRsvp(id, session.userId);
    if (alreadyRsvped) return reply.status(409).send({ error: "already_attending" });
    await rsvpEvent(id, session.userId, randomUUID());
    await emitEventHub({
      source: "app-api",
      event: "event.offline.rsvp",
      data: {
        eventId: id,
        userId: session.userId,
        userName: session.displayName ?? session.email,
        eventTitle: event.title,
        eventDate: event.dateTime,
        createdAt: new Date().toISOString(),
      },
    });
    return reply.send({ status: "attending" });
  });

  // Cancel RSVP
  app.delete("/v1/events/:id/rsvp", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!requireMemberWorkspaceAccess(session, reply)) return;
    const { id } = request.params as { id: string };
    await cancelRsvp(id, session.userId);
    return reply.send({ status: "not_attending" });
  });

  // Cancel event (own events or admin)
  app.patch("/v1/events/:id/cancel", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const event = await getEventById(id);
    if (!event) return reply.status(404).send({ error: "event_not_found" });
    const isOwner = event.postedBy === session.userId;
    const isAdmin = session.role === "admin" || session.role === "super_admin";
    if (!isOwner && !isAdmin) return reply.status(403).send({ error: "forbidden" });
    const cancelled = await cancelEvent(id, event.postedBy);
    return reply.send({ event: cancelled });
  });
}
