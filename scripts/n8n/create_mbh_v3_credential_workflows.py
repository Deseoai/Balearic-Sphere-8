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
required = [
    "NOTION_DB_APPLICATIONS",
    "NOTION_DB_USERS",
    "NOTION_DB_PROFILES",
    "NOTION_DB_CREDITS_LEDGER",
    "NOTION_DB_MARKETPLACE_LISTINGS",
    "NOTION_DB_FORUM_POSTS",
    "NOTION_DB_INTRO_REQUESTS",
    "NOTION_DB_CIRCLE_ACCESS_REQUESTS",
    "NOTION_DB_AI_REQUESTS",
    "NOTION_DB_NOTIFICATIONS",
    "NOTION_DB_REPUTATION_EVENTS",
    "NOTION_DB_AUDIT_LOGS",
    "NOTION_DB_WEBHOOK_EVENTS",
]
missing = [k for k in required if not ids.get(k)]
if missing:
    raise SystemExit(f"Missing DB IDs: {', '.join(missing)}")


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


def notion_http_node_common(url: str, json_body_expr: str):
    return {
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "parameters": {
            "method": "POST",
            "url": url,
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
            "jsonBody": json_body_expr,
            "options": {},
        },
        "credentials": {
            "httpHeaderAuth": {
                "id": NOTION_CREDENTIAL_ID,
                "name": NOTION_CREDENTIAL_NAME,
            }
        },
    }


def event_hub_v3():
    js_code = f"""
const payload = $json || {{}};
const event = String(payload.event || payload.type || 'unknown');
const data = payload.data && typeof payload.data === 'object' ? payload.data : {{}};
const emittedAt = payload.emittedAt || new Date().toISOString();
const fallbackId = `${{Date.now()}}-${{Math.random().toString(36).slice(2,10)}}`;
const eventId = String(payload.eventId || payload.id || fallbackId);

const DB = {{
  applications: '{ids['NOTION_DB_APPLICATIONS']}',
  users: '{ids['NOTION_DB_USERS']}',
  profiles: '{ids['NOTION_DB_PROFILES']}',
  credits_ledger: '{ids['NOTION_DB_CREDITS_LEDGER']}',
  marketplace_listings: '{ids['NOTION_DB_MARKETPLACE_LISTINGS']}',
  forum_posts: '{ids['NOTION_DB_FORUM_POSTS']}',
  intro_requests: '{ids['NOTION_DB_INTRO_REQUESTS']}',
  circle_access_requests: '{ids['NOTION_DB_CIRCLE_ACCESS_REQUESTS']}',
  ai_requests: '{ids['NOTION_DB_AI_REQUESTS']}',
  notifications: '{ids['NOTION_DB_NOTIFICATIONS']}',
  reputation_events: '{ids['NOTION_DB_REPUTATION_EVENTS']}',
  audit_logs: '{ids['NOTION_DB_AUDIT_LOGS']}',
  webhook_events: '{ids['NOTION_DB_WEBHOOK_EVENTS']}'
}};

const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);
const asTitle = (value, limit = 120) => ({{ title: [{{ type: 'text', text: {{ content: trunc(value, limit) || 'Untitled' }} }}] }});
const asRich = (value) => ({{ rich_text: value ? [{{ type: 'text', text: {{ content: trunc(value) }} }}] : [] }});
const asSelect = (value) => ({{ select: {{ name: trunc(value, 100) || 'unknown' }} }});
const asMultiSelect = (arr) => ({{ multi_select: Array.isArray(arr) ? arr.slice(0, 20).map((x) => ({{ name: trunc(x, 80) }})) : [] }});
const asNumber = (value) => ({{ number: Number.isFinite(Number(value)) ? Number(value) : 0 }});
const asDate = (value) => ({{ date: {{ start: new Date(value || emittedAt).toISOString() }} }});
const asEmail = (value) => ({{ email: value ? trunc(value, 120) : null }});
const toJson = (value) => JSON.stringify(value ?? {{}}).slice(0, 1800);

let target = 'webhook_events';
if (event.startsWith('application.')) target = 'applications';
else if (event.startsWith('user.')) target = 'users';
else if (event.startsWith('profile.')) target = 'profiles';
else if (event.startsWith('credits.')) target = 'credits_ledger';
else if (event.startsWith('marketplace.')) target = 'marketplace_listings';
else if (event.startsWith('forum.')) target = 'forum_posts';
else if (event.startsWith('intro.')) target = 'intro_requests';
else if (event.startsWith('circle.access.') || event.startsWith('access.level.') || event.startsWith('upgrade.')) target = 'circle_access_requests';
else if (event.startsWith('ai.')) target = 'ai_requests';
else if (event.startsWith('notification.')) target = 'notifications';
else if (event.startsWith('reputation.')) target = 'reputation_events';
else if (event.startsWith('audit.')) target = 'audit_logs';

let properties;
if (target === 'applications') {{
  properties = {{
    'Name': asTitle(data.name || data.displayName || `Applicant ${{eventId.slice(0,8)}}`),
    'Application ID': asRich(data.applicationId || eventId),
    'Email': asEmail(data.email),
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
    'Submitted At': asDate(data.submittedAt || emittedAt),
    'Last Event ID': asRich(eventId)
  }};
}} else if (target === 'users') {{
  properties = {{
    'User ID': asTitle(data.userId || eventId),
    'Email': asEmail(data.email),
    'Role': asSelect(data.role || 'applicant'),
    'Access Level': asSelect(data.accessLevel || 'explorer'),
    'Verification Status': asSelect(data.verificationStatus || 'none'),
    'Trust Score': asNumber(data.trustScore),
    'Contribution Score': asNumber(data.contributionScore),
    'Connector Score': asNumber(data.connectorScore),
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'profiles') {{
  properties = {{
    'Profile ID': asTitle(data.profileId || eventId),
    'User ID': asRich(data.userId || ''),
    'Display Name': asRich(data.displayName || ''),
    'Headline': asRich(data.headline || ''),
    'Short Bio': asRich(data.shortBio || ''),
    'Long Bio': asRich(data.longBio || ''),
    'Tags': asMultiSelect(data.tags || []),
    'Location': asRich(data.location || ''),
    'Offer': asRich(data.offer || ''),
    'Seek': asRich(data.seek || ''),
    'Website': {{ url: data.website || null }},
    'LinkedIn': {{ url: data.linkedin || null }},
    'Instagram': {{ url: data.instagram || null }},
    'Visibility': asSelect(data.visibility || 'members'),
    'Updated At': asDate(data.updatedAt || emittedAt)
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
}} else if (target === 'marketplace_listings') {{
  properties = {{
    'Listing ID': asTitle(data.listingId || eventId),
    'Posted By': asRich(data.postedBy || ''),
    'Type': asSelect(data.type || 'opportunity'),
    'Category': asRich(data.category || ''),
    'Title': asRich(data.title || ''),
    'Summary': asRich(data.summary || ''),
    'Description': asRich(data.description || ''),
    'Visibility': asSelect(data.visibility || 'members'),
    'Status': asSelect(data.status || 'active'),
    'Credits Cost': asNumber(data.creditsCost),
    'Trust Requirement': asNumber(data.trustRequirement),
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'forum_posts') {{
  properties = {{
    'Post ID': asTitle(data.postId || eventId),
    'Room': asSelect(data.room || 'tech_ai'),
    'Author ID': asRich(data.authorId || ''),
    'Topic': asRich(data.topic || ''),
    'Content': asRich(data.content || ''),
    'AI Summary': asRich(data.aiSummary || ''),
    'Quality Score': asNumber(data.qualityScore),
    'Reward Credits': asNumber(data.rewardCredits),
    'Moderation Status': asSelect(data.moderationStatus || 'approved'),
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'intro_requests') {{
  properties = {{
    'Intro ID': asTitle(data.introId || eventId),
    'Requester ID': asRich(data.requesterId || ''),
    'Target User ID': asRich(data.targetUserId || ''),
    'Message': asRich(data.message || ''),
    'Status': asSelect(data.status || 'pending'),
    'Credits Spent': asNumber(data.creditsSpent),
    'Created At': asDate(data.createdAt || emittedAt)
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
    'Reviewed At': data.reviewedAt ? asDate(data.reviewedAt) : {{ date: null }},
    'Last Event ID': asRich(eventId)
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
}} else if (target === 'notifications') {{
  properties = {{
    'Notification ID': asTitle(data.notificationId || eventId),
    'User ID': asRich(data.userId || ''),
    'Kind': asRich(data.kind || event),
    'Title': asRich(data.title || ''),
    'Body': asRich(data.body || ''),
    'Channel': asSelect(data.channel || 'in_app'),
    'Read At': data.readAt ? asDate(data.readAt) : {{ date: null }},
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'reputation_events') {{
  properties = {{
    'Reputation Event ID': asTitle(data.reputationEventId || eventId),
    'User ID': asRich(data.userId || ''),
    'Event Type': asRich(data.eventType || event),
    'Score Delta': asNumber(data.scoreDelta),
    'Reason': asRich(data.reason || ''),
    'Created At': asDate(data.createdAt || emittedAt)
  }};
}} else if (target === 'audit_logs') {{
  properties = {{
    'Audit ID': asTitle(data.auditId || eventId),
    'Actor User ID': asRich(data.actorUserId || ''),
    'Action': asRich(data.action || event),
    'Target Type': asRich(data.targetType || ''),
    'Target ID': asRich(data.targetId || ''),
    'Metadata': asRich(toJson(data.metadata || data)),
    'Created At': asDate(data.createdAt || emittedAt)
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
    notionBody: {{ parent: {{ database_id: DB[target] }}, properties }}
  }}
}}];
""".strip()

    create_page = notion_http_node_common("https://api.notion.com/v1/pages", "={{$json.notionBody}}")
    create_page.update(
        {
            "id": "create-notion-page",
            "name": "Create Notion Page",
            "position": [860, 300],
        }
    )

    return {
        "name": "MBH - 30 Event Hub (V3 Credential)",
        "nodes": [
            {
                "id": "webhook-in",
                "name": "Webhook In",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [220, 300],
                "webhookId": "mbh-v3-events-full",
                "parameters": {
                    "httpMethod": "POST",
                    "path": "mbh/v3/events/full",
                    "responseMode": "responseNode",
                    "options": {},
                },
            },
            {
                "id": "build-notion-page",
                "name": "Build Notion Page",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [520, 300],
                "parameters": {"jsCode": js_code},
            },
            create_page,
            {
                "id": "respond-ack",
                "name": "Respond ACK",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.3,
                "position": [1160, 300],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": "={{ { status: 'accepted', event: $json.event, eventId: $json.eventId, mappedDatabase: $json.target } }}",
                    "options": {},
                },
            },
        ],
        "connections": {
            "Webhook In": {"main": [[{"node": "Build Notion Page", "type": "main", "index": 0}]]},
            "Build Notion Page": {"main": [[{"node": "Create Notion Page", "type": "main", "index": 0}]]},
            "Create Notion Page": {"main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]},
        },
        "settings": {},
    }


def hitl_v3(name: str, path: str, webhook_id: str, decision_type: str):
    js_code = f"""
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

return [{{json: {{decisionId, decisionType: '{decision_type}', webhookEventPage, auditLogPage}}}}];
""".strip()

    create_webhook_event = notion_http_node_common("https://api.notion.com/v1/pages", "={{$json.webhookEventPage}}")
    create_webhook_event.update(
        {
            "id": "create-webhook-event",
            "name": "Create Webhook Event",
            "position": [800, 180],
        }
    )

    create_audit_log = notion_http_node_common("https://api.notion.com/v1/pages", "={{$json.auditLogPage}}")
    create_audit_log.update(
        {
            "id": "create-audit-log",
            "name": "Create Audit Log",
            "position": [800, 380],
        }
    )

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
                "parameters": {
                    "httpMethod": "POST",
                    "path": path,
                    "responseMode": "responseNode",
                    "options": {},
                },
            },
            {
                "id": "build-pages",
                "name": "Build Decision Pages",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [500, 280],
                "parameters": {"jsCode": js_code},
            },
            create_webhook_event,
            create_audit_log,
            {
                "id": "respond-ack",
                "name": "Respond ACK",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.3,
                "position": [1110, 280],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": "={{ { status: 'accepted', decisionType: $json.decisionType, decisionId: $json.decisionId } }}",
                    "options": {},
                },
            },
        ],
        "connections": {
            "Webhook In": {"main": [[{"node": "Build Decision Pages", "type": "main", "index": 0}]]},
            "Build Decision Pages": {
                "main": [
                    [{"node": "Create Webhook Event", "type": "main", "index": 0}],
                    [{"node": "Create Audit Log", "type": "main", "index": 0}],
                ]
            },
            "Create Webhook Event": {"main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]},
            "Create Audit Log": {"main": [[{"node": "Respond ACK", "type": "main", "index": 0}]]},
        },
        "settings": {},
    }


def error_logger_v3():
    js_code = f"""
const payload = $json || {{}};
const execution = payload.execution || {{}};
const workflow = payload.workflow || {{}};
const error = payload.error || {{}};
const now = new Date().toISOString();
const eventId = `wferr-${{Date.now()}}-${{Math.random().toString(36).slice(2,9)}}`;
const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);

const page = {{
  parent: {{ database_id: '{ids['NOTION_DB_AUDIT_LOGS']}' }},
  properties: {{
    'Audit ID': {{ title: [{{ type: 'text', text: {{ content: trunc(eventId, 120) }} }}] }},
    'Actor User ID': {{ rich_text: [{{ type: 'text', text: {{ content: 'n8n-system' }} }}] }},
    'Action': {{ rich_text: [{{ type: 'text', text: {{ content: 'workflow.error' }} }}] }},
    'Target Type': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(workflow.name || workflow.id || 'unknown-workflow', 200) }} }}] }},
    'Target ID': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(String(workflow.id || execution.id || '')) }} }}] }},
    'Metadata': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(JSON.stringify({{ execution, error }})) }} }}] }},
    'Created At': {{ date: {{ start: now }} }}
  }}
}};

return [{{ json: {{ page }} }}];
""".strip()

    create_page = notion_http_node_common("https://api.notion.com/v1/pages", "={{$json.page}}")
    create_page.update(
        {
            "id": "create-page",
            "name": "Create Audit Page",
            "position": [900, 280],
        }
    )

    return {
        "name": "MBH - 39 Global Error Logger (V3 Credential)",
        "nodes": [
            {
                "id": "error-trigger",
                "name": "Error Trigger",
                "type": "n8n-nodes-base.errorTrigger",
                "typeVersion": 1,
                "position": [240, 280],
                "parameters": {},
            },
            {
                "id": "build-page",
                "name": "Build Audit Page",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 280],
                "parameters": {"jsCode": js_code},
            },
            create_page,
        ],
        "connections": {
            "Error Trigger": {"main": [[{"node": "Build Audit Page", "type": "main", "index": 0}]]},
            "Build Audit Page": {"main": [[{"node": "Create Audit Page", "type": "main", "index": 0}]]},
        },
        "settings": {},
    }


payloads = [
    event_hub_v3(),
    hitl_v3(
        "MBH - 31 HITL Application Decision (V3 Credential)",
        "mbh/v3/hitl/application/decision",
        "mbh-v3-hitl-application-decision",
        "application",
    ),
    hitl_v3(
        "MBH - 32 HITL Upgrade Decision (V3 Credential)",
        "mbh/v3/hitl/upgrade/decision",
        "mbh-v3-hitl-upgrade-decision",
        "upgrade",
    ),
    error_logger_v3(),
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

out_path = Path("scripts/n8n/workflows.v3-credential.created.json")
out_path.write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print(f"Saved summary to {out_path}")
