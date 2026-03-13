# Security + Webhooks Standard

## Basis

- HTTPS only
- HMAC SHA-256 Signatur
- Timestamp Window (default 300s)
- Idempotency Key
- Schema Validation
- Structured Audit Log

## Header-Kontrakt

- `x-signature`: hex(HMAC_SHA256(secret, `${timestamp}.${canonical_json_body}`))
- `x-timestamp`: Unix ms
- `x-idempotency-key`: eindeutige Event-ID je Zustellung

`canonical_json_body` bedeutet: JSON mit stabil sortierten Keys, damit Sender und Empfaenger denselben String signieren.

## Empfangsreihenfolge

1. Pflichtheader vorhanden?
2. Timestamp im Gueltigkeitsfenster?
3. Signature korrekt?
4. Idempotency noch nicht verarbeitet?
5. Payload validiert?
6. Event annehmen und idempotency markieren

## Betriebsregeln

- Secret Rotation pro Environment
- Rate Limit pro Sender/IP
- Alerting bei Signature-Mismatch Peaks
- Kein Secret in Frontend/Client

## Admin-Sicherheit

- 2FA fuer Adminrollen
- Audit Trail fuer jede Freigabe
- Rollen strikt serverseitig geprueft
