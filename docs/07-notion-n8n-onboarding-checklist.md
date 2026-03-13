# Notion + n8n Onboarding Checklist

Das brauche ich von dir, damit ich alles vollstaendig verdrahte und Notion-DBs final anlege.

## 1) Notion Zugang

- `NOTION_TOKEN` (Integration Secret, intern)
- `NOTION_PARENT_PAGE_ID` (Seite, unter der alle DBs erstellt werden)
- Die Parent-Page muss mit der Integration geteilt sein

Optional aber hilfreich:

- Workspace Name
- Wunsch fuer DB-Prefix (z. B. `MPN -`)

## 2) n8n Zugang und Endpunkte

- Basis-URL deines n8n (z. B. `https://n8n.deinedomain.com`)
- Liste der Inbound Webhook URLs (n8n -> App und App -> n8n)
- Gewuenschte Webhook Secret Rotation Policy (z. B. 90 Tage)

## 3) Human-in-the-loop Regeln (entscheidend)

Bitte final bestaetigen:

- Bewerbungen:
  - AI pre-score erzeugt nur Empfehlung
  - Endgueltige Annahme/Ablehnung manuell durch Admin in Notion
- Upgrades (Access Level/Circle):
  - immer manuelle Freigabe
  - oder nur ab bestimmtem Score manuell
- SLA:
  - Zielzeit fuer Review (z. B. <24h)

## 4) Domain + Server

- finale API-Domain (z. B. `api.deinedomain.com`)
- finale Web-Domain (z. B. `app.deinedomain.com`)
- oeffentliche IP oder Hostname
- SSL/TLS-Strategie (Caddy oder Nginx + certbot)

## 5) Auth und Kommunikation

- Email Provider (Resend, Postmark, SES, etc.)
- gewuenschte Login Methode fuer MVP:
  - magic link
  - invite token
  - optional Google/Apple spaeter

## 6) Compliance / Datenschutz

- Impressum/Datenschutz vorhanden (ja/nein)
- Datenregion (EU only ja/nein)
- Aufbewahrung fuer Audit Logs (z. B. 12 Monate)

## 7) Betriebsregeln

- Monitoring Tool (Sentry, BetterStack, etc.)
- Alert Kanal (Email/Slack)
- Backup-Frequenz Postgres

## Direkt nach Bereitstellung der Daten mache ich

1. Notion DBs automatisch erstellen via Script
2. DB-ID Mapping sichern (`scripts/notion/databases.created.json`)
3. n8n Workflows fuer:
   - application review
   - upgrade approvals
   - credits events
   - AI request logging
4. Webhook Signing + Idempotency End-to-End aktivieren
