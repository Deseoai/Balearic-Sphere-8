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
NOTION_CREDENTIAL_ID = os.environ.get("NOTION_CREDENTIAL_ID", "")
NOTION_CREDENTIAL_NAME = os.environ.get("NOTION_CREDENTIAL_NAME", "MBH - Notion Header Auth")

if not BASE_URL:
    raise SystemExit("Missing N8N_BASE_URL")
if not API_KEY:
    raise SystemExit("Missing N8N_API_KEY")
if not NOTION_CREDENTIAL_ID:
    raise SystemExit("Missing NOTION_CREDENTIAL_ID")

ids_path = Path("docs/notion-database-ids.env")
if not ids_path.exists():
    raise SystemExit(f"Missing {ids_path}")


def parse_env_file(path: Path):
    data = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip()
    return data


ids = parse_env_file(ids_path)


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


def notion_http_node(name: str, node_id: str, position: list, json_expr: str):
    return {
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": position,
        "parameters": {
            "method": "POST",
            "url": "https://api.notion.com/v1/pages",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "Notion-Version", "value": "2022-06-28"},
                    {"name": "Content-Type", "value": "application/json"},
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": json_expr,
            "options": {},
        },
        "credentials": {
            "httpHeaderAuth": {
                "id": NOTION_CREDENTIAL_ID,
                "name": NOTION_CREDENTIAL_NAME,
            }
        },
    }


def hitl_workflow(name: str, path: str, webhook_id: str, decision_type: str):
    js_code = f"""
const payload = ($json && $json.body && typeof $json.body === 'object') ? $json.body : ($json || {{}});
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

return [{{json: {{decisionId, decisionType: '{decision_type}', webhookEventPage, auditLogPage}}}}];
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
                "webhookId": webhook_id,
                "parameters": {"httpMethod": "POST", "path": path, "responseMode": "responseNode", "options": {}},
            },
            {
                "id": "build-pages",
                "name": "Build Decision Pages",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [500, 280],
                "parameters": {"jsCode": js_code},
            },
            notion_http_node(
                "Create Webhook Event",
                "create-webhook-event",
                [800, 200],
                "={{$item(0).$node['Build Decision Pages'].json.webhookEventPage}}",
            ),
            notion_http_node(
                "Create Audit Log",
                "create-audit-log",
                [1080, 200],
                "={{$item(0).$node['Build Decision Pages'].json.auditLogPage}}",
            ),
            {
                "id": "respond-ack",
                "name": "Respond ACK",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.3,
                "position": [1360, 200],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": "={{ { status: 'accepted', decisionType: $item(0).$node['Build Decision Pages'].json.decisionType, decisionId: $item(0).$node['Build Decision Pages'].json.decisionId } }}",
                    "options": {},
                },
            },
        ],
        "connections": {
            "Webhook In": {"main": [[{"node": "Build Decision Pages", "type": "main", "index": 0}]]},
            "Build Decision Pages": {"main": [[{"node": "Create Webhook Event", "type": "main", "index": 0}]]},
            "Create Webhook Event": {"main": [[{"node": "Create Audit Log", "type": "main", "index": 0}]]},
            "Create Audit Log": {"main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]},
        },
        "settings": {},
    }


payloads = [
    hitl_workflow(
        "MBH - 51 HITL Application Decision (V5)",
        "mbh/v5/hitl/application/decision",
        "mbh-v5-hitl-application-decision",
        "application",
    ),
    hitl_workflow(
        "MBH - 52 HITL Upgrade Decision (V5)",
        "mbh/v5/hitl/upgrade/decision",
        "mbh-v5-hitl-upgrade-decision",
        "upgrade",
    ),
]

existing = list_workflows()
existing_by_name = {wf.get("name"): wf for wf in existing}

summary = {
    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "baseUrl": BASE_URL,
    "notionCredentialId": NOTION_CREDENTIAL_ID,
    "results": [],
}

for wf in payloads:
    existing_match = existing_by_name.get(wf["name"])
    if existing_match:
        workflow_id = existing_match["id"]
        created = False
    else:
        created_resp = request_json("POST", "/api/v1/workflows", wf)
        workflow_id = created_resp["id"]
        created = True

    active = False
    activation_error = None
    try:
        request_json("POST", f"/api/v1/workflows/{workflow_id}/activate", {})
        active = True
    except Exception as exc:
        activation_error = str(exc)

    webhook_path = None
    for node in wf.get("nodes", []):
        if node.get("type") == "n8n-nodes-base.webhook":
            webhook_path = node.get("parameters", {}).get("path")
            break

    summary["results"].append(
        {
            "name": wf["name"],
            "id": workflow_id,
            "created": created,
            "active": active,
            "activationError": activation_error,
            "webhookProductionUrl": f"{BASE_URL}/webhook/{webhook_path}" if webhook_path else None,
        }
    )

out_path = Path("scripts/n8n/workflows.v5-hitl.created.json")
out_path.write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print(f"Saved summary to {out_path}")
