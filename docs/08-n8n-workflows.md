# n8n Workflows (MBH)

Final aktiver MBH-Stand.

## Aktiv (produktiv)

1. `MBH - 40 Event Hub (V4 Final)`
   - ID: `IMMYNiSeNH6xIEZy`
   - Webhook: `POST /webhook/mbh/v4/events/full`
   - Zweck: Event-Routing aus App/Server in die passende Notion DB

2. `MBH - 51 HITL Application Decision (V5)`
   - ID: `mpQWFdttUTDSk6xn`
   - Webhook: `POST /webhook/mbh/v5/hitl/application/decision`
   - Zweck: schreibt manuelle Bewerbungsentscheidung in:
     - `Webhook Events`
     - `Audit Logs`

3. `MBH - 52 HITL Upgrade Decision (V5)`
   - ID: `JWOhM1rbwOxSsqSh`
   - Webhook: `POST /webhook/mbh/v5/hitl/upgrade/decision`
   - Zweck: schreibt manuelle Upgradeentscheidung in:
     - `Webhook Events`
     - `Audit Logs`

4. `MBH - 39 Global Error Logger (V3 Credential)`
   - ID: `ncyo3PN7kzXde0kA`
   - Trigger: global workflow errors
   - Zweck: persistiert Fehlerereignisse in `Audit Logs`

5. `MBH - 61 HITL Applications Poller (V6)`
   - ID: `4ZdZt6sFWIyzlhE8`
   - Trigger: Schedule (alle 10 Minuten)
   - Zweck: liest finale Bewerbungsentscheidungen aus Notion und sendet Ruecksync an App-Callback (`application.reviewed`)

6. `MBH - 62 HITL Upgrades Poller (V6)`
   - ID: `qhEdMT1Sgp5l9p6l`
   - Trigger: Schedule (alle 10 Minuten)
   - Zweck: liest Upgrade-Entscheidungen aus Notion und sendet Ruecksync an App-Callback (`upgrade.reviewed`)

7. `MBH - 63 AI Requests Worker (V6)`
   - ID: `Aef6XHFYhAA5Wcae`
   - Trigger: Schedule (alle 5 Minuten)
   - Zweck: verarbeitet `AI Requests` mit Status `queued`, schreibt Ergebnisse in Notion und erzeugt Audit-Eintraege

8. `MBH - 64 Weekly Strategic Brief Generator (V6B)`
   - ID: `Ba5b0Sr01e5pMMdC`
   - Trigger: Schedule (alle 168 Stunden)
   - Zweck: erzeugt woechentliche Brief-Benachrichtigungen in Notion

9. `MBH - 71 Email Alerts Router (V7)`
   - ID: nach Erstellung in `scripts/n8n/workflows.v7-email.created.json`
   - Webhook: `POST /webhook/mbh/v7/email/alerts`
   - Zweck: verschickt E-Mails bei wichtigen App-Events (Registrierung, AI, Listings, Upgrades, Reviews)

## Produktions-Endpoints (final)

- `https://cpmn8n.deseo-services.com/webhook/mbh/v4/events/full`
- `https://cpmn8n.deseo-services.com/webhook/mbh/v5/hitl/application/decision`
- `https://cpmn8n.deseo-services.com/webhook/mbh/v5/hitl/upgrade/decision`
- `https://cpmn8n.deseo-services.com/webhook/mbh/v7/email/alerts`

## Wichtig

- Notion-Zugriff laeuft ueber Credential:
  - `MBH - Notion Header Auth`
  - ID: `luvMj9AQiA4Ye6I8`
- Alte MBH-Versionen wurden deaktiviert, um Fehl-Routing zu vermeiden.

## Artefakte im Repo

- `scripts/n8n/create_mbh_v4_final_workflows.py`
- `scripts/n8n/create_mbh_v5_hitl_workflows.py`
- `scripts/n8n/create_mbh_v6_extended_workflows.py`
- `scripts/n8n/create_mbh_v7_email_workflows.py`
- `scripts/n8n/workflows.v4-final.created.json`
- `scripts/n8n/workflows.v5-hitl.created.json`
- `scripts/n8n/workflows.v6-extended.created.json`
- `scripts/n8n/workflows.v7-email.created.json`
