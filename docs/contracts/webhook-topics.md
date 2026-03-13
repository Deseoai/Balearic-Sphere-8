# Webhook Topics Contract (App <-> n8n <-> Notion)

## Pflichtfelder fuer jedes Event

- `event`: Topic Name
- `eventId`: UUID
- `emittedAt`: ISO DateTime
- `source`: `app-api` | `n8n` | `notion-sync`
- `idempotencyKey`: String
- `data`: Objekt

## Kern-Topics (MVP)

- `application.submitted`
- `application.scored`
- `application.reviewed`
- `access.level.changed`
- `circle.access.requested`
- `circle.access.reviewed`
- `credits.transaction.created`
- `profile.updated`
- `intro.request.created`
- `intro.request.updated`
- `marketplace.listing.created`
- `marketplace.listing.updated`
- `forum.post.created`
- `ai.request.created`
- `ai.request.completed`
- `notification.created`
- `audit.event.created`

## Human-in-the-loop Gates

- `application.reviewed`
  - nur nach Admin-Decision in Notion
- `circle.access.reviewed`
  - nur nach manueller Freigabe/Ablehnung
- `access.level.changed`
  - nur wenn Approval Event bestaetigt ist

## Fehlerverhalten

- 5xx vom Empfaenger -> Retry mit exponential backoff
- Duplicate idempotencyKey -> ignorieren, 200/202 antworten
- Signature mismatch -> 401 + security alert
