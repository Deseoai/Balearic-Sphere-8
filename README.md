# Mallorca Private Access Network

Initiales V1-Fundament fuer ein kuratiertes, AI-gestuetztes Business-Zugangsnetzwerk fuer Mallorca/Balearen.

## Was bereits angelegt ist

- `apps/web`: Next.js Landing + Access-Application Flow
- `apps/api`: Fastify API mit Access Requests, Credits und abgesicherten Webhooks
- `packages/shared`: Gemeinsame Typen (Access, Credits, Webhooks)
- `db/schema.sql`: Postgres MVP-Schema
- `docs/`: Produkt-, Architektur- und MVP-Dokumentation
- `docker-compose.yml`: Postgres + Redis

## Quickstart

1. `.env.example` nach `.env` kopieren
2. Node.js 20+ installieren, dann Dependencies installieren

```bash
pnpm install
```

Alternative:

```bash
npm install
```

3. Infrastruktur starten

```bash
docker compose up -d
```

4. API und Web starten

```bash
npm run dev
```

Alternative:

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- Admin UI: `http://localhost:3000/admin` (login with `ADMIN_PANEL_PASSWORD`)

## Admin quick reference

- Admin URL: `http://localhost:3000/admin`
- Login credential: `ADMIN_PANEL_PASSWORD` (set in `.env`)
- Mail sender fallback (events): `ALERTS_FROM_EMAIL` (default `management@balea-sphere8.com`)
- Approval actions:
  - Access applications: `Access applications` section
  - Circle upgrades: `Circle upgrade requests` section
- User management: create, edit, approve, remove users in `User management`
- Magic-link visibility:
  - Admin panel: `User management` -> `Show magic links`
  - Notion: `audit.magic_link.issued` events are mirrored to the Audit Logs database

## MVP-Ziel in diesem Setup

- Exklusive Landing mit klarer Zugangslogik
- Bewerbungsprozess mit AI-Pre-Scoring
- Credit-Wallet Grundmechanik
- Signierte n8n-Webhook-Anbindung (HMAC, Timestamp, Replay-Schutz)
- Datenmodell fuer Notion + Postgres Sync

## Naechster Build-Block

- Persistenz (Prisma/Drizzle) statt In-Memory Store
- Auth (Magic Link + Invite Tokens)
- Admin Review UI
- Notion Sync Worker + n8n Automations
- Graph-View Lite (Node/Edge Rendering)

## Notion Bootstrap

Vorbereitung:

- `NOTION_TOKEN` setzen
- `NOTION_PARENT_PAGE_ID` setzen
- Parent Page mit der Integration teilen

DBs erstellen:

```bash
node scripts/notion/bootstrap.mjs
```

Artefakte:

- Spec: `scripts/notion/databases.spec.json`
- Ergebnis-Mapping: `scripts/notion/databases.created.json`
- ENV-Format IDs: `docs/notion-database-ids.env`

## n8n Workflow Bootstrap

Voraussetzungen:

- `N8N_BASE_URL` (z. B. `https://cpmn8n.deseo-services.com`)
- `N8N_API_KEY`
- In n8n Runtime: `NOTION_TOKEN` als Env-Variable

Erstellen/Aktivieren:

```bash
python3 scripts/n8n/create_mbh_workflows.py
```

Artefakte:

- Workflow-Skript: `scripts/n8n/create_mbh_workflows.py`
- Ergebnis-Mapping: `scripts/n8n/workflows.created.json`

## n8n Notion Ops Ausbau

Notion Sync-Felder auf DBs erweitern:

```bash
NOTION_TOKEN=... python3 scripts/notion/enhance_hitl_sync_fields.py
```

Erweitertes Ops-Set erstellen:

```bash
N8N_BASE_URL=... N8N_API_KEY=... python3 scripts/n8n/create_mbh_notion_ops_workflows.py
N8N_BASE_URL=... N8N_API_KEY=... python3 scripts/n8n/create_mbh_webhookid_workflows.py
N8N_BASE_URL=... N8N_API_KEY=... NOTION_CREDENTIAL_ID=... python3 scripts/n8n/create_mbh_v4_final_workflows.py
N8N_BASE_URL=... N8N_API_KEY=... NOTION_CREDENTIAL_ID=... python3 scripts/n8n/create_mbh_v5_hitl_workflows.py
N8N_BASE_URL=... N8N_API_KEY=... python3 scripts/n8n/create_mbh_v6_extended_workflows.py
```

Zusammenfassung:

- `scripts/notion/databases.sync-fields.json`
- `scripts/n8n/workflows.notion-ops.created.json`
- `scripts/n8n/workflows.webhookid.created.json`
- `scripts/n8n/workflows.v4-final.created.json`
- `scripts/n8n/workflows.v5-hitl.created.json`
- `scripts/n8n/workflows.v6-extended.created.json`
