# Technische Architektur (V1)

## Zielbild

- `Notion`: Operations-Master (Admin, Moderation, Redaktionsdaten)
- `Postgres`: Runtime-App-Daten (Abfragen, Ledger, Graph, Notifications)
- `Redis`: Cache, Rate Limits, Queue-States
- `API`: Security + Access Engine + Credit Engine + AI Orchestration
- `n8n`: Workflow-Orchestrierung, nicht Runtime-Core

## Laufzeitkomponenten

- `apps/web` (Next.js): Landing, Access, Member UI
- `apps/api` (Fastify): zentrale Kontrollschicht
- `worker` (folgend): Sync/Scoring/Briefing Jobs
- `postgres` + `redis`

## Prinzipien

- Notion nie direkt ans Frontend
- Jede Aktion geht durch die API Access Engine
- Credit-System als Ledger, nicht als einzelner Counter
- Webhooks signiert und idempotent

## API Kernendpunkte (MVP)

- `POST /v1/access-requests`
- `GET /v1/credits/:userId`
- `POST /v1/webhooks/n8n`
- `GET /health`

## Erweiterung nach MVP

- Auth-Service (Magic Link, Apple/Google, Invite)
- Graph Query Layer
- AI Matching Jobs
- Notification Hub (email/push/in-app)
