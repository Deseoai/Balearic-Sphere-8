# Notion + Postgres Sync-Design

## Rollentrennung

Notion:

- Applications (Review)
- Editorial/Moderation
- Ops-Dashboards

Postgres:

- Users/Profiles
- Credits/Transactions
- Graph Nodes/Edges
- Marketplace/Forum Runtime
- Notifications/Audit

## Sync-Richtung

- `Notion -> Postgres`: administrative Updates (Freigaben, Flags, Moderation)
- `Postgres -> Notion`: kuratierte Spiegelung fuer Ops-Reporting

## Trigger

- Application submitted -> n8n -> Notion row create
- Application reviewed in Notion -> webhook -> API -> user/access update
- Credit event in API -> optional mirror to Notion ledger view

## Konfliktregel

- Access-Freigaben: Notion Master
- Runtime-Events (Credits, Unlocks, Interactions): Postgres Master

## Idempotenz

- Jeder Sync mit `event_id` + `source_system`
- doppelte Events werden verworfen
