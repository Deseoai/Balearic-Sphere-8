#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("N8N_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("N8N_API_KEY", "")
SMTP_CREDENTIAL_ID = os.environ.get("N8N_SMTP_CREDENTIAL_ID", "").strip()
SMTP_CREDENTIAL_NAME = os.environ.get("N8N_SMTP_CREDENTIAL_NAME", "").strip()
EMAIL_FROM = os.environ.get("MBH_EMAIL_FROM", "management@balea-sphere8.com").strip()
DEFAULT_ADMIN_EMAIL = os.environ.get("MBH_DEFAULT_ADMIN_EMAIL", "oliver.condurache@deseoai.com").strip()
FORCE_UPDATE_EXISTING = os.environ.get("MBH_FORCE_UPDATE_EXISTING", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

if not BASE_URL:
    raise SystemExit("Missing N8N_BASE_URL")
if not API_KEY:
    raise SystemExit("Missing N8N_API_KEY")


def request_json(method: str, path: str, payload=None):
    url = f"{BASE_URL}{path}"
    headers = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {body}") from exc


def list_workflows():
    out = []
    cursor = None
    while True:
        qs = "?limit=100"
        if cursor:
            qs += "&cursor=" + urllib.parse.quote(cursor)
        res = request_json("GET", f"/api/v1/workflows{qs}")
        out.extend(res.get("data", []))
        cursor = res.get("nextCursor")
        if not cursor:
            break
    return out


def list_credentials():
    out = []
    cursor = None
    while True:
        qs = "?limit=100"
        if cursor:
            qs += "&cursor=" + urllib.parse.quote(cursor)
        res = request_json("GET", f"/api/v1/credentials{qs}")
        out.extend(res.get("data", []))
        cursor = res.get("nextCursor")
        if not cursor:
            break
    return out


def resolve_smtp_credential():
    if SMTP_CREDENTIAL_ID:
        return {"id": SMTP_CREDENTIAL_ID, "name": SMTP_CREDENTIAL_NAME or "SMTP Credential"}

    credentials = list_credentials()
    for item in credentials:
        if item.get("type") == "smtp" and item.get("id"):
            return {"id": item["id"], "name": item.get("name") or "SMTP Credential"}
    return None


def update_workflow(workflow_id: str, workflow):
    payload = {}
    for key in ("name", "nodes", "connections", "settings", "pinData", "staticData", "meta", "tags"):
        if key in workflow:
            payload[key] = workflow[key]
    return request_json("PUT", f"/api/v1/workflows/{workflow_id}", payload)


def activate_workflow(workflow_id: str):
    return request_json("POST", f"/api/v1/workflows/{workflow_id}/activate", {})


def create_workflow_if_missing(workflow, existing_by_name):
    name = workflow["name"]
    if name in existing_by_name:
        existing_id = existing_by_name[name]["id"]
        if not FORCE_UPDATE_EXISTING:
            return {
                "name": name,
                "id": existing_id,
                "created": False,
                "updated": False,
                "active": None,
                "activationError": None,
                "skippedReason": "already_exists",
                "webhookProductionUrl": extract_webhook_url(workflow),
            }

        existing_active = bool(existing_by_name[name].get("active"))
        activation_error = None
        update_workflow(existing_id, workflow)
        if existing_active:
            try:
                activate_workflow(existing_id)
            except Exception as exc:
                activation_error = str(exc)

        return {
            "name": name,
            "id": existing_id,
            "created": False,
            "updated": True,
            "active": existing_active,
            "activationError": activation_error,
            "skippedReason": None,
            "webhookProductionUrl": extract_webhook_url(workflow),
        }

    created = request_json("POST", "/api/v1/workflows", workflow)
    workflow_id = created["id"]
    active = False
    activation_error = None
    try:
        activate_workflow(workflow_id)
        active = True
    except Exception as exc:
        activation_error = str(exc)

    return {
        "name": name,
        "id": workflow_id,
        "created": True,
        "updated": False,
        "active": active,
        "activationError": activation_error,
        "skippedReason": None,
        "webhookProductionUrl": extract_webhook_url(workflow),
    }


def extract_webhook_url(workflow):
    webhook_path = None
    for node in workflow.get("nodes", []):
        if node.get("type") == "n8n-nodes-base.webhook":
            webhook_path = node.get("parameters", {}).get("path")
            break
    if not webhook_path:
        return None
    return f"{BASE_URL}/webhook/{webhook_path}"


def email_router_v7(smtp_credential):
    js_code = """
const source = $json?.body && typeof $json.body === 'object' ? $json.body : ($json || {});
const data = source.data && typeof source.data === 'object' ? source.data : {};
const event = String(source.event || 'unknown');

const defaultAdmin = '__DEFAULT_ADMIN_EMAIL__';
const toEmail =
  String(data.notifyEmail || '').trim() ||
  String(data.adminEmail || '').trim() ||
  String(data.userEmail || data.email || '').trim() ||
  defaultAdmin;

const memberName = String(data.userName || data.displayName || '').trim();
const fallbackName = String(data.userEmail || data.email || '').trim().split('@')[0] || 'there';
const firstName = (memberName || fallbackName || 'there').split(' ')[0];
const magicLinkUrl = String(data.magicLinkUrl || '').trim();
const workspaceUrl = magicLinkUrl || 'https://app.balea-sphere8.com/workspace';

function humanize(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safe(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const copyByEvent = {
  'email.application.submitted': {
    subject: 'Application received',
    title: 'Your application is in',
    intro: `Hi ${firstName}, thanks for applying to Balea Sphere.`,
    body: 'Our team is reviewing your profile now. We will share next steps shortly.',
  },
  'email.auth.magic_link.requested': {
    subject: 'Your secure sign-in link',
    title: 'Your sign-in link is ready',
    intro: `Hi ${firstName}, you requested a secure sign-in link.`,
    body: 'Tap the button below to access your workspace.',
  },
  'email.auth.login.success': {
    subject: 'You are signed in',
    title: 'Login successful',
    intro: `Hi ${firstName}, your sign-in was successful.`,
    body: 'Your workspace is now active and ready.',
  },
  'email.ai.request.created': {
    subject: 'AI request started',
    title: 'Your AI request is queued',
    intro: `Hi ${firstName}, your AI request was received.`,
    body: 'You will see progress and results inside your workspace.',
  },
  'email.ai.concierge.completed': {
    subject: 'Concierge result ready',
    title: 'Your concierge recommendation is ready',
    intro: `Hi ${firstName}, your concierge run has finished.`,
    body: 'Open your workspace to review the latest recommendations.',
  },
  'email.marketplace.listing.created': {
    subject: 'Listing published',
    title: 'Your listing is now live',
    intro: `Hi ${firstName}, your listing has been published.`,
    body: 'Relevant members can now discover and engage with it.',
  },
  'email.circle.access.requested': {
    subject: 'Circle request submitted',
    title: 'Your circle request is in review',
    intro: `Hi ${firstName}, your circle access request was submitted.`,
    body: 'We will notify you as soon as a decision is available.',
  },
  'email.network.intro.requested': {
    subject: 'Intro request submitted',
    title: 'Your introduction request is in motion',
    intro: `Hi ${firstName}, your intro request has been submitted.`,
    body: 'Our team will review the fit and update you with the next step.',
  },
  'email.credits.purchase.created': {
    subject: 'Credits added to your account',
    title: 'Your credits are now available',
    intro: `Hi ${firstName}, your credit package was added successfully.`,
    body: 'You can now use your credits to unlock intros, AI actions, and circle requests.',
  },
  'email.application.reviewed': {
    subject: 'Application update',
    title: 'Your application has been reviewed',
    intro: `Hi ${firstName}, there is an update on your application.`,
    body: 'Please check your workspace for the latest status and next steps.',
  },
  'email.circle.access.reviewed': {
    subject: 'Circle decision update',
    title: 'Your circle request was reviewed',
    intro: `Hi ${firstName}, there is an update on your circle request.`,
    body: 'Open your workspace to view the current status.',
  },
};

const copy = copyByEvent[event] || {
  subject: 'Workspace update',
  title: 'You have a new update',
  intro: `Hi ${firstName}, there is a new update in your account.`,
  body: 'Open your workspace to view the latest details.',
};

const infoRows = [];
if (safe(data.title)) infoRows.push(['Title', safe(data.title)]);
if (safe(data.circle)) infoRows.push(['Circle', safe(data.circle)]);
if (safe(data.category)) infoRows.push(['Category', humanize(data.category)]);
if (safe(data.location)) infoRows.push(['Location', safe(data.location)]);
if (safe(data.promptType)) infoRows.push(['Request type', humanize(data.promptType)]);
if (safe(data.status)) infoRows.push(['Status', humanize(data.status)]);
if (safe(data.recommendedAccessLevel || data.accessLevel)) {
  infoRows.push(['Access level', humanize(data.recommendedAccessLevel || data.accessLevel)]);
}

const textLines = [
  'Balea Sphere',
  '',
  copy.intro,
  copy.body,
];
if (infoRows.length > 0) {
  textLines.push('', 'Quick summary:');
  for (const [label, value] of infoRows.slice(0, 6)) {
    textLines.push(`- ${label}: ${value}`);
  }
}
textLines.push('', `Open workspace: ${workspaceUrl}`);
if (event === 'email.auth.magic_link.requested' && magicLinkUrl) {
  textLines.push(`Secure sign-in link: ${magicLinkUrl}`);
}
const text = textLines.join('\\n');

const rowsHtml = infoRows.length
  ? `
    <table style="border-collapse:collapse;width:100%;margin:12px 0 0 0;">
      ${infoRows.slice(0, 6).map(([label, value]) => `
        <tr>
          <td style="padding:7px 0;color:#8f7b68;font-size:13px;">${escapeHtml(label)}</td>
          <td style="padding:7px 0;color:#2f241b;font-size:13px;"><strong>${escapeHtml(value)}</strong></td>
        </tr>
      `).join('')}
    </table>
  `
  : '';

const ctaLabel = event === 'email.auth.magic_link.requested' ? 'Sign in now' : 'Open workspace';
const ctaUrl = event === 'email.auth.magic_link.requested' && magicLinkUrl ? magicLinkUrl : workspaceUrl;

const html = `
  <div style="background:#f7efe3;padding:24px;font-family:Arial,sans-serif;color:#2f241b;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eadbc8;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 22px;background:linear-gradient(135deg,#f4d2a5,#e9bb83);">
        <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5b442e;">Balea Sphere</p>
        <h2 style="margin:8px 0 0 0;font-size:26px;line-height:1.2;color:#2f241b;">${escapeHtml(copy.title)}</h2>
      </div>
      <div style="padding:20px 22px 24px 22px;">
        <p style="margin:0 0 10px 0;font-size:15px;line-height:1.55;color:#3f3126;">${escapeHtml(copy.intro)}</p>
        <p style="margin:0;font-size:15px;line-height:1.55;color:#3f3126;">${escapeHtml(copy.body)}</p>
        ${rowsHtml}
        <div style="margin-top:18px;">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#c96a3c;color:#fff;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:700;">
            ${escapeHtml(ctaLabel)}
          </a>
        </div>
      </div>
    </div>
  </div>
`.trim();

return [{ json: { toEmail, subject: `Balea Sphere | ${copy.subject}`, text, html } }];
""".strip().replace("__DEFAULT_ADMIN_EMAIL__", DEFAULT_ADMIN_EMAIL.replace("\\", "\\\\").replace("'", "\\'"))

    workflow = {
        "name": "MBH - 71 Email Alerts Router (V7)",
        "nodes": [
            {
                "id": "webhook",
                "name": "Webhook In",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [240, 280],
                "webhookId": "mbh-v7-email-alerts",
                "parameters": {
                    "httpMethod": "POST",
                    "path": "mbh/v7/email/alerts",
                    "responseMode": "onReceived",
                    "options": {},
                },
            },
            {
                "id": "prepare",
                "name": "Build Email",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [520, 280],
                "parameters": {"jsCode": js_code},
            },
            {
                "id": "send",
                "name": "Send Email",
                "type": "n8n-nodes-base.emailSend",
                "typeVersion": 2.1,
                "position": [780, 280],
                "parameters": {
                    "fromEmail": EMAIL_FROM,
                    "toEmail": "={{$json.toEmail}}",
                    "subject": "={{$json.subject}}",
                    "emailFormat": "html",
                    "text": "={{$json.text}}",
                    "html": "={{$json.html}}",
                },
            },
        ],
        "connections": {
            "Webhook In": {"main": [[{"node": "Build Email", "type": "main", "index": 0}]]},
            "Build Email": {"main": [[{"node": "Send Email", "type": "main", "index": 0}]]},
        },
        "settings": {},
    }

    if smtp_credential:
        for node in workflow["nodes"]:
            if node.get("id") == "send":
                node["credentials"] = {"smtp": smtp_credential}
                break

    return workflow


def main():
    smtp_credential = resolve_smtp_credential()
    existing = list_workflows()
    existing_by_name = {item.get("name"): item for item in existing if item.get("name")}

    workflows = [email_router_v7(smtp_credential)]
    results = [create_workflow_if_missing(workflow, existing_by_name) for workflow in workflows]

    output_path = Path("scripts/n8n/workflows.v7-email.created.json")
    output_path.write_text(
        json.dumps(
            {"baseUrl": BASE_URL, "smtpCredential": smtp_credential, "results": results},
            indent=2,
        ),
        encoding="utf-8",
    )

    print(json.dumps({"baseUrl": BASE_URL, "smtpCredential": smtp_credential, "results": results}, indent=2))
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
