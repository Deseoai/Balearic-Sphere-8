#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("N8N_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("N8N_API_KEY", "")

if not BASE_URL:
  raise SystemExit("Missing N8N_BASE_URL")
if not API_KEY:
  raise SystemExit("Missing N8N_API_KEY")

DB_IDS_PATH = Path("docs/notion-database-ids.env")
if not DB_IDS_PATH.exists():
  raise SystemExit(f"Missing {DB_IDS_PATH}")


def parse_env_file(path: Path) -> dict:
  data = {}
  for line in path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, v = line.split("=", 1)
    data[k.strip()] = v.strip()
  return data


ids = parse_env_file(DB_IDS_PATH)

required_db_keys = [
  "NOTION_DB_APPLICATIONS",
  "NOTION_DB_CIRCLE_ACCESS_REQUESTS",
  "NOTION_DB_CREDITS_LEDGER",
  "NOTION_DB_AI_REQUESTS",
  "NOTION_DB_WEBHOOK_EVENTS",
  "NOTION_DB_AUDIT_LOGS",
]

missing = [k for k in required_db_keys if not ids.get(k)]
if missing:
  raise SystemExit(f"Missing DB IDs: {', '.join(missing)}")


def request_json(method: str, path: str, payload=None):
  url = f"{BASE_URL}{path}"
  data = None
  headers = {
    "X-N8N-API-KEY": API_KEY,
    "Content-Type": "application/json",
  }
  if payload is not None:
    data = json.dumps(payload).encode("utf-8")

  req = urllib.request.Request(url, data=data, headers=headers, method=method)
  try:
    with urllib.request.urlopen(req, timeout=40) as resp:
      body = resp.read().decode("utf-8")
      return json.loads(body) if body else {}
  except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", errors="replace")
    raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {body}") from exc


def list_workflows() -> list:
  data = []
  cursor = None
  while True:
    qs = "?limit=100"
    if cursor:
      qs += "&cursor=" + urllib.parse.quote(cursor)
    resp = request_json("GET", f"/api/v1/workflows{qs}")
    data.extend(resp.get("data", []))
    cursor = resp.get("nextCursor")
    if not cursor:
      break
  return data


def event_hub_workflow():
  js_code = f"""
const payload = $json || {{}};
const event = String(payload.event || payload.type || 'unknown');
const data = payload.data && typeof payload.data === 'object' ? payload.data : {{}};
const emittedAt = payload.emittedAt || new Date().toISOString();
const fallbackId = `${{Date.now()}}-${{Math.random().toString(36).slice(2,10)}}`;
const eventId = String(payload.eventId || payload.id || fallbackId);

const DB = {{
  applications: '{ids['NOTION_DB_APPLICATIONS']}',
  circle_access_requests: '{ids['NOTION_DB_CIRCLE_ACCESS_REQUESTS']}',
  credits_ledger: '{ids['NOTION_DB_CREDITS_LEDGER']}',
  ai_requests: '{ids['NOTION_DB_AI_REQUESTS']}',
  webhook_events: '{ids['NOTION_DB_WEBHOOK_EVENTS']}'
}};

const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);
const asTitle = (value) => ({{ title: [{{ type: 'text', text: {{ content: trunc(value, 120) || 'Untitled' }} }}] }});
const asRich = (value) => ({{ rich_text: [{{ type: 'text', text: {{ content: trunc(value) }} }}] }});
const asSelect = (value) => ({{ select: {{ name: trunc(value, 100) || 'unknown' }} }});
const asNumber = (value) => ({{ number: Number.isFinite(Number(value)) ? Number(value) : 0 }});
const asDate = (value) => ({{ date: {{ start: new Date(value || emittedAt).toISOString() }} }});

let target = 'webhook_events';
if (event.startsWith('application.')) target = 'applications';
else if (event.startsWith('circle.access.') || event.startsWith('access.level.') || event.startsWith('upgrade.')) target = 'circle_access_requests';
else if (event.startsWith('credits.')) target = 'credits_ledger';
else if (event.startsWith('ai.')) target = 'ai_requests';

let properties;
if (target === 'applications') {{
  properties = {{
    'Name': asTitle(data.name || data.displayName || `Applicant ${{eventId.slice(0,8)}}`),
    'Application ID': asRich(data.applicationId || eventId),
    'Email': {{ email: trunc(data.email, 120) || null }},
    'Category': asSelect(data.category || 'other'),
    'Location': asRich(data.location || ''),
    'What Offer': asRich(data.whatOffer || ''),
    'What Seek': asRich(data.whatSeek || ''),
    'Why Join': asRich(data.whyJoin || ''),
    'Status': asSelect(data.status || 'under_review'),
    'AI Score': asNumber(data.aiScore),
    'Human Score': asNumber(data.humanScore),
    'Recommended Access': asSelect(data.recommendedAccess || 'explorer'),
    'Admin Notes': asRich(data.adminNotes || ''),
    'Submitted At': asDate(data.submittedAt || emittedAt)
  }};
}} else if (target === 'circle_access_requests') {{
  properties = {{
    'Request ID': asTitle(data.requestId || eventId),
    'User ID': asRich(data.userId || ''),
    'Circle': asRich(data.circle || data.circleName || ''),
    'Current Access': asSelect(data.currentAccess || 'explorer'),
    'AI Suitability': asNumber(data.aiSuitability),
    'Status': asSelect(data.status || 'under_review'),
    'Reason': asRich(data.reason || event),
    'Reviewed At': data.reviewedAt ? asDate(data.reviewedAt) : {{ date: null }}
  }};
}} else if (target === 'credits_ledger') {{
  properties = {{
    'Transaction ID': asTitle(data.transactionId || eventId),
    'User ID': asRich(data.userId || ''),
    'Type': asSelect(data.type || 'spend_ai'),
    'Source': asSelect(data.source || 'earned'),
    'Amount': asNumber(data.amount),
    'Reason': asRich(data.reason || event),
    'Reference ID': asRich(data.referenceId || ''),
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'ai_requests') {{
  properties = {{
    'AI Request ID': asTitle(data.aiRequestId || eventId),
    'User ID': asRich(data.userId || ''),
    'Prompt Type': asSelect(data.promptType || 'concierge'),
    'Prompt': asRich(data.prompt || ''),
    'Response Summary': asRich(data.responseSummary || ''),
    'Model': asRich(data.model || ''),
    'Credits Used': asNumber(data.creditsUsed),
    'Status': asSelect(data.status || 'queued'),
    'Created At': asDate(data.createdAt || emittedAt),
    'Completed At': data.completedAt ? asDate(data.completedAt) : {{ date: null }}
  }};
}} else {{
  properties = {{
    'Event ID': asTitle(eventId),
    'Direction': asSelect(data.direction || 'inbound'),
    'Topic': asRich(event),
    'Status': asSelect(data.status || 'queued'),
    'Attempts': asNumber(data.attempts || 1),
    'Source': asRich(payload.source || 'app-api'),
    'Destination': asRich('notion'),
    'Error': asRich(data.error || ''),
    'Created At': asDate(emittedAt)
  }};
}}

return [{{
  json: {{
    event,
    eventId,
    target,
    notionBody: {{
      parent: {{ database_id: DB[target] }},
      properties
    }}
  }}
}}];
""".strip()

  return {
    "name": "MBH - 00 Event Hub (All-in-One)",
    "nodes": [
      {
        "id": "webhook-in",
        "name": "Webhook In",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [220, 300],
        "parameters": {
          "httpMethod": "POST",
          "path": "mbh/events/all",
          "responseMode": "responseNode",
          "options": {}
        }
      },
      {
        "id": "build-notion-page",
        "name": "Build Notion Page",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [520, 300],
        "parameters": {
          "jsCode": js_code
        }
      },
      {
        "id": "create-notion-page",
        "name": "Create Notion Page",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [830, 300],
        "parameters": {
          "method": "POST",
          "url": "https://api.notion.com/v1/pages",
          "sendHeaders": True,
          "headerParameters": {
            "parameters": [
              {
                "name": "Authorization",
                "value": "={{'Bearer ' + $env.NOTION_TOKEN}}"
              },
              {
                "name": "Notion-Version",
                "value": "2022-06-28"
              },
              {
                "name": "Content-Type",
                "value": "application/json"
              }
            ]
          },
          "sendBody": True,
          "specifyBody": "json",
          "jsonBody": "={{$json.notionBody}}",
          "options": {}
        }
      },
      {
        "id": "respond-ack",
        "name": "Respond ACK",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.3,
        "position": [1130, 300],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ { status: 'accepted', event: $json.event, eventId: $json.eventId, mappedDatabase: $json.target } }}",
          "options": {}
        }
      }
    ],
    "connections": {
      "Webhook In": {
        "main": [[{"node": "Build Notion Page", "type": "main", "index": 0}]]
      },
      "Build Notion Page": {
        "main": [[{"node": "Create Notion Page", "type": "main", "index": 0}]]
      },
      "Create Notion Page": {
        "main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]
      }
    },
    "settings": {}
  }


def hitl_decision_workflow(name: str, path: str, decision_type: str):
  code = f"""
const payload = $json || {{}};
const decisionId = String(payload.decisionId || payload.eventId || `${{Date.now()}}-${{Math.random().toString(36).slice(2,9)}}`);
const emittedAt = payload.emittedAt || new Date().toISOString();
const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);
const asTitle = (value) => ({{ title: [{{ type: 'text', text: {{ content: trunc(value, 120) || 'Untitled' }} }}] }});
const asRich = (value) => ({{ rich_text: [{{ type: 'text', text: {{ content: trunc(value) }} }}] }});
const asSelect = (value) => ({{ select: {{ name: trunc(value, 100) || 'queued' }} }});
const asNumber = (value) => ({{ number: Number.isFinite(Number(value)) ? Number(value) : 0 }});
const asDate = (value) => ({{ date: {{ start: new Date(value || emittedAt).toISOString() }} }});

const webhookEventPage = {{
  parent: {{ database_id: '{ids['NOTION_DB_WEBHOOK_EVENTS']}' }},
  properties: {{
    'Event ID': asTitle(decisionId),
    'Direction': asSelect('inbound'),
    'Topic': asRich('{decision_type}.reviewed'),
    'Status': asSelect('acked'),
    'Attempts': asNumber(1),
    'Source': asRich('human-review'),
    'Destination': asRich('notion'),
    'Error': asRich(''),
    'Created At': asDate(emittedAt)
  }}
}};

const auditLogPage = {{
  parent: {{ database_id: '{ids['NOTION_DB_AUDIT_LOGS']}' }},
  properties: {{
    'Audit ID': asTitle(decisionId),
    'Actor User ID': asRich(data.reviewedBy || data.actorUserId || 'manual-reviewer'),
    'Action': asRich('{decision_type}.reviewed'),
    'Target Type': asRich(data.targetType || '{decision_type}'),
    'Target ID': asRich(data.targetId || data.applicationId || data.requestId || ''),
    'Metadata': asRich(JSON.stringify(data).slice(0, 1800)),
    'Created At': asDate(emittedAt)
  }}
}};

return [{{
  json: {{
    decisionId,
    decisionType: '{decision_type}',
    webhookEventPage,
    auditLogPage
  }}
}}];
""".strip()

  return {
    "name": name,
    "nodes": [
      {
        "id": "webhook-in",
        "name": "Webhook In",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [220, 280],
        "parameters": {
          "httpMethod": "POST",
          "path": path,
          "responseMode": "responseNode",
          "options": {}
        }
      },
      {
        "id": "build-pages",
        "name": "Build Decision Pages",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [500, 280],
        "parameters": {
          "jsCode": code
        }
      },
      {
        "id": "create-webhook-event",
        "name": "Create Webhook Event",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [800, 180],
        "parameters": {
          "method": "POST",
          "url": "https://api.notion.com/v1/pages",
          "sendHeaders": True,
          "headerParameters": {
            "parameters": [
              {"name": "Authorization", "value": "={{'Bearer ' + $env.NOTION_TOKEN}}"},
              {"name": "Notion-Version", "value": "2022-06-28"},
              {"name": "Content-Type", "value": "application/json"}
            ]
          },
          "sendBody": True,
          "specifyBody": "json",
          "jsonBody": "={{$json.webhookEventPage}}",
          "options": {}
        }
      },
      {
        "id": "create-audit-log",
        "name": "Create Audit Log",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [800, 380],
        "parameters": {
          "method": "POST",
          "url": "https://api.notion.com/v1/pages",
          "sendHeaders": True,
          "headerParameters": {
            "parameters": [
              {"name": "Authorization", "value": "={{'Bearer ' + $env.NOTION_TOKEN}}"},
              {"name": "Notion-Version", "value": "2022-06-28"},
              {"name": "Content-Type", "value": "application/json"}
            ]
          },
          "sendBody": True,
          "specifyBody": "json",
          "jsonBody": "={{$json.auditLogPage}}",
          "options": {}
        }
      },
      {
        "id": "respond-ack",
        "name": "Respond ACK",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.3,
        "position": [1110, 280],
        "parameters": {
          "respondWith": "json",
          "responseBody": "={{ { status: 'accepted', decisionType: $json.decisionType, decisionId: $json.decisionId } }}",
          "options": {}
        }
      }
    ],
    "connections": {
      "Webhook In": {
        "main": [[{"node": "Build Decision Pages", "type": "main", "index": 0}]]
      },
      "Build Decision Pages": {
        "main": [
          [{"node": "Create Webhook Event", "type": "main", "index": 0}],
          [{"node": "Create Audit Log", "type": "main", "index": 0}]
        ]
      },
      "Create Webhook Event": {
        "main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]
      },
      "Create Audit Log": {
        "main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]
      }
    },
    "settings": {}
  }


workflow_payloads = [
  event_hub_workflow(),
  hitl_decision_workflow(
    "MBH - 10 HITL Application Decision",
    "mbh/hitl/application/decision",
    "application"
  ),
  hitl_decision_workflow(
    "MBH - 11 HITL Upgrade Decision",
    "mbh/hitl/upgrade/decision",
    "upgrade"
  ),
]

existing = list_workflows()
by_name = {wf.get("name"): wf for wf in existing}

summary = {
  "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "baseUrl": BASE_URL,
  "results": []
}

for wf in workflow_payloads:
  existing_match = by_name.get(wf["name"])
  if existing_match:
    workflow_id = existing_match["id"]
    created = False
  else:
    resp = request_json("POST", "/api/v1/workflows", wf)
    workflow_id = resp["id"]
    created = True

  activation_error = None
  try:
    request_json("POST", f"/api/v1/workflows/{workflow_id}/activate", {})
    active = True
  except Exception as exc:
    active = False
    activation_error = str(exc)

  summary["results"].append({
    "name": wf["name"],
    "id": workflow_id,
    "created": created,
    "active": active,
    "activationError": activation_error,
    "webhookProductionUrl": f"{BASE_URL}/webhook/{next(n['parameters']['path'] for n in wf['nodes'] if n['type']=='n8n-nodes-base.webhook')}"
  })

out_path = Path("scripts/n8n/workflows.created.json")
out_path.write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print(f"Saved summary to {out_path}")
