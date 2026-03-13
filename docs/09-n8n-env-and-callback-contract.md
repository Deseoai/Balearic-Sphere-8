# n8n Env + Callback Contract

## Notion Auth (final)

- In den finalen Workflows wird Notion ueber ein n8n Credential angebunden:
  - Name: `MBH - Notion Header Auth`
  - Type: `httpHeaderAuth`
  - Header: `Authorization: Bearer <NOTION_TOKEN>`

Hinweis:

- `$env.NOTION_TOKEN` wird in dieser Instanz in Node-Expressions blockiert (`N8N_BLOCK_ENV_ACCESS_IN_NODE`).
- Deshalb laeuft die produktive Anbindung ueber Credential, nicht ueber `$env`.

## Optional fuer spaeteren Notion -> App Ruecksync

- `MBH_APP_APPLICATION_DECISION_URL`
- `MBH_APP_UPGRADE_DECISION_URL`
- `MBH_APP_AI_RESULT_URL`
- `MBH_APP_SHARED_KEY`

## Env fuer V6 Poller/Worker

- `NOTION_TOKEN` (in n8n Runtime gesetzt)
- `MBH_APP_APPLICATION_DECISION_URL` (optional, fuer Bewerbungs-Ruecksync)
- `MBH_APP_UPGRADE_DECISION_URL` (optional, fuer Upgrade-Ruecksync)
- `MBH_APP_AI_RESULT_URL` (optional, fuer AI-Result Callback)
- `MBH_APP_SHARED_KEY` (optional, wird als `x-api-key` gesendet)

## Env fuer V7 Email Alerts

- `ADMIN_NOTIFY_EMAIL` (Empfaenger fuer Owner-Alerts)
- `ALERTS_FROM_EMAIL` (Absenderadresse fuer Send Email Node)
- Optional: SMTP Credential im `Send Email` Node hinterlegen

API-seitig:

- `N8N_EMAIL_ALERT_WEBHOOK_URL` -> `https://cpmn8n.deseo-services.com/webhook/mbh/v7/email/alerts`

## Callback Payload (Applications Poller)

```json
{
  "event": "application.reviewed",
  "eventId": "application-reviewed-...",
  "emittedAt": "2026-03-10T20:00:00.000Z",
  "source": "notion-hitl",
  "data": {
    "applicationId": "...",
    "status": "accepted|rejected|waitlisted",
    "email": "...",
    "category": "...",
    "location": "...",
    "aiScore": 78,
    "humanScore": 92,
    "recommendedAccess": "verified",
    "reviewedAt": "...",
    "adminNotes": "..."
  }
}
```

## Callback Payload (Upgrades Poller)

```json
{
  "event": "upgrade.reviewed",
  "eventId": "upgrade-reviewed-...",
  "emittedAt": "2026-03-10T20:00:00.000Z",
  "source": "notion-hitl",
  "data": {
    "requestId": "...",
    "userId": "...",
    "circle": "...",
    "status": "approved|rejected|waitlisted",
    "currentAccess": "curated",
    "aiSuitability": 83,
    "reason": "...",
    "reviewedAt": "..."
  }
}
```

## Callback Payload (AI Requests Worker)

```json
{
  "event": "ai.request.completed",
  "eventId": "ai-result-...",
  "emittedAt": "2026-03-10T20:00:00.000Z",
  "source": "n8n-ai-worker",
  "data": {
    "aiRequestId": "...",
    "userId": "...",
    "promptType": "concierge|matchmaking|deal_radar",
    "prompt": "...",
    "responseSummary": "...",
    "model": "n8n-auto-brief-v1",
    "completedAt": "..."
  }
}
```

## Header

Wenn gesetzt:

- `x-api-key: <MBH_APP_SHARED_KEY>`
