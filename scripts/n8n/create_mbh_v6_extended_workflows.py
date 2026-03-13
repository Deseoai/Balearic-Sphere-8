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
    "NOTION_DB_CIRCLE_ACCESS_REQUESTS",
    "NOTION_DB_AI_REQUESTS",
    "NOTION_DB_NOTIFICATIONS",
    "NOTION_DB_AUDIT_LOGS",
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


def create_workflow_if_missing(workflow, existing_by_name):
    name = workflow["name"]
    if name in existing_by_name:
        return {
            "name": name,
            "id": existing_by_name[name]["id"],
            "created": False,
            "active": None,
            "activationError": None,
            "skippedReason": "already_exists",
            "webhookProductionUrl": extract_webhook_url(workflow),
        }

    created = request_json("POST", "/api/v1/workflows", workflow)
    workflow_id = created["id"]
    active = False
    activation_error = None
    try:
        request_json("POST", f"/api/v1/workflows/{workflow_id}/activate", {})
        active = True
    except Exception as exc:
        activation_error = str(exc)

    return {
        "name": name,
        "id": workflow_id,
        "created": True,
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


def applications_poller_v6():
    js_code = f"""
const notionToken = (typeof process !== 'undefined' && process.env) ? process.env.NOTION_TOKEN : '';
if (!notionToken) {{
  return [{{ json: {{ ok: false, reason: 'NOTION_TOKEN missing in n8n env' }} }}];
}}

const appUrl = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_APPLICATION_DECISION_URL || '') : '';
const appSharedKey = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_SHARED_KEY || '') : '';

const dbId = '{ids['NOTION_DB_APPLICATIONS']}';
const nowIso = new Date().toISOString();
const notionHeaders = {{
  'Authorization': `Bearer ${{notionToken}}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
}};

const queryBody = {{
  filter: {{
    and: [
      {{
        or: [
          {{ property: 'Status', select: {{ equals: 'accepted' }} }},
          {{ property: 'Status', select: {{ equals: 'rejected' }} }},
          {{ property: 'Status', select: {{ equals: 'waitlisted' }} }}
        ]
      }},
      {{
        or: [
          {{ property: 'Integration Status', select: {{ does_not_equal: 'sent' }} }},
          {{ property: 'Integration Status', select: {{ is_empty: true }} }}
        ]
      }}
    ]
  }},
  page_size: 50
}};

const qRes = await fetch(`https://api.notion.com/v1/databases/${{dbId}}/query`, {{
  method: 'POST',
  headers: notionHeaders,
  body: JSON.stringify(queryBody)
}});

if (!qRes.ok) {{
  return [{{ json: {{ ok: false, reason: `query_failed_${{qRes.status}}`, details: await qRes.text() }} }}];
}}

const queryJson = await qRes.json();
const rows = queryJson.results || [];

const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);
const getSelect = (props, key) => props?.[key]?.select?.name || '';
const getRich = (props, key) => (props?.[key]?.rich_text || []).map((x) => x?.plain_text || '').join('').trim();
const getDate = (props, key) => props?.[key]?.date?.start || null;
const getEmail = (props, key) => props?.[key]?.email || '';
const getNumber = (props, key) => Number(props?.[key]?.number || 0);

let processed = 0;
let sent = 0;
let failed = 0;
let skipped = 0;

for (const page of rows) {{
  processed += 1;
  const props = page.properties || {{}};
  const applicationId = getRich(props, 'Application ID') || page.id;
  const status = getSelect(props, 'Status') || 'under_review';
  const email = getEmail(props, 'Email');
  const category = getSelect(props, 'Category') || 'other';
  const location = getRich(props, 'Location');
  const aiScore = Number(props?.['AI Score']?.number || 0);
  const humanScore = Number(props?.['Human Score']?.number || 0);
  const recommendedAccess = getSelect(props, 'Recommended Access') || 'explorer';
  const reviewedAt = getDate(props, 'Reviewed At');
  const adminNotes = getRich(props, 'Admin Notes');
  const attempts = getNumber(props, 'Sync Attempts') + 1;

  const eventId = `application-reviewed-${{applicationId}}-${{Date.now()}}`;
  const callbackPayload = {{
    event: 'application.reviewed',
    eventId,
    emittedAt: nowIso,
    source: 'notion-hitl',
    data: {{
      applicationId,
      status,
      email,
      category,
      location,
      aiScore,
      humanScore,
      recommendedAccess,
      reviewedAt,
      adminNotes
    }}
  }};

  let syncStatus = 'skipped';
  let syncError = '';

  if (!appUrl) {{
    syncStatus = 'skipped';
    syncError = 'MBH_APP_APPLICATION_DECISION_URL not configured';
    skipped += 1;
  }} else {{
    const headers = {{ 'Content-Type': 'application/json' }};
    if (appSharedKey) headers['x-api-key'] = appSharedKey;

    const cb = await fetch(appUrl, {{
      method: 'POST',
      headers,
      body: JSON.stringify(callbackPayload)
    }});

    if (cb.ok) {{
      syncStatus = 'sent';
      sent += 1;
    }} else {{
      syncStatus = 'failed';
      failed += 1;
      syncError = `callback_http_${{cb.status}}`;
    }}
  }}

  const updateBody = {{
    properties: {{
      'Integration Status': {{ select: {{ name: syncStatus }} }},
      'Last Synced At': {{ date: {{ start: new Date().toISOString() }} }},
      'Sync Attempts': {{ number: attempts }},
      'Last Sync Error': {{ rich_text: syncError ? [{{ type: 'text', text: {{ content: trunc(syncError) }} }}] : [] }},
      'Last Event ID': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(eventId, 240) }} }}] }}
    }}
  }};

  await fetch(`https://api.notion.com/v1/pages/${{page.id}}`, {{
    method: 'PATCH',
    headers: notionHeaders,
    body: JSON.stringify(updateBody)
  }});
}}

return [{{
  json: {{
    ok: true,
    processed,
    sent,
    failed,
    skipped,
    appUrlConfigured: !!appUrl
  }}
}}];
""".strip()

    return {
        "name": "MBH - 61 HITL Applications Poller (V6)",
        "nodes": [
            {
                "id": "schedule",
                "name": "Schedule Trigger",
                "type": "n8n-nodes-base.scheduleTrigger",
                "typeVersion": 1.2,
                "position": [240, 280],
                "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
            },
            {
                "id": "poll",
                "name": "Poll + Sync",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 280],
                "parameters": {"jsCode": js_code},
            },
        ],
        "connections": {"Schedule Trigger": {"main": [[{"node": "Poll + Sync", "type": "main", "index": 0}]]}},
        "settings": {},
    }


def upgrades_poller_v6():
    js_code = f"""
const notionToken = (typeof process !== 'undefined' && process.env) ? process.env.NOTION_TOKEN : '';
if (!notionToken) {{
  return [{{ json: {{ ok: false, reason: 'NOTION_TOKEN missing in n8n env' }} }}];
}}

const appUrl = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_UPGRADE_DECISION_URL || '') : '';
const appSharedKey = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_SHARED_KEY || '') : '';

const dbId = '{ids['NOTION_DB_CIRCLE_ACCESS_REQUESTS']}';
const nowIso = new Date().toISOString();
const notionHeaders = {{
  'Authorization': `Bearer ${{notionToken}}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
}};

const queryBody = {{
  filter: {{
    and: [
      {{
        or: [
          {{ property: 'Status', select: {{ equals: 'approved' }} }},
          {{ property: 'Status', select: {{ equals: 'rejected' }} }},
          {{ property: 'Status', select: {{ equals: 'waitlisted' }} }}
        ]
      }},
      {{
        or: [
          {{ property: 'Integration Status', select: {{ does_not_equal: 'sent' }} }},
          {{ property: 'Integration Status', select: {{ is_empty: true }} }}
        ]
      }}
    ]
  }},
  page_size: 50
}};

const qRes = await fetch(`https://api.notion.com/v1/databases/${{dbId}}/query`, {{
  method: 'POST',
  headers: notionHeaders,
  body: JSON.stringify(queryBody)
}});

if (!qRes.ok) {{
  return [{{ json: {{ ok: false, reason: `query_failed_${{qRes.status}}`, details: await qRes.text() }} }}];
}}

const queryJson = await qRes.json();
const rows = queryJson.results || [];

const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);
const getSelect = (props, key) => props?.[key]?.select?.name || '';
const getRich = (props, key) => (props?.[key]?.rich_text || []).map((x) => x?.plain_text || '').join('').trim();
const getDate = (props, key) => props?.[key]?.date?.start || null;
const getNumber = (props, key) => Number(props?.[key]?.number || 0);

let processed = 0;
let sent = 0;
let failed = 0;
let skipped = 0;

for (const page of rows) {{
  processed += 1;
  const props = page.properties || {{}};
  const requestId = (props?.['Request ID']?.title || []).map((x) => x?.plain_text || '').join('').trim() || page.id;
  const userId = getRich(props, 'User ID');
  const circle = getRich(props, 'Circle');
  const status = getSelect(props, 'Status') || 'under_review';
  const currentAccess = getSelect(props, 'Current Access') || 'explorer';
  const aiSuitability = Number(props?.['AI Suitability']?.number || 0);
  const reason = getRich(props, 'Reason');
  const reviewedAt = getDate(props, 'Reviewed At');
  const attempts = getNumber(props, 'Sync Attempts') + 1;

  const eventId = `upgrade-reviewed-${{requestId}}-${{Date.now()}}`;
  const callbackPayload = {{
    event: 'upgrade.reviewed',
    eventId,
    emittedAt: nowIso,
    source: 'notion-hitl',
    data: {{
      requestId,
      userId,
      circle,
      status,
      currentAccess,
      aiSuitability,
      reason,
      reviewedAt
    }}
  }};

  let syncStatus = 'skipped';
  let syncError = '';

  if (!appUrl) {{
    syncStatus = 'skipped';
    syncError = 'MBH_APP_UPGRADE_DECISION_URL not configured';
    skipped += 1;
  }} else {{
    const headers = {{ 'Content-Type': 'application/json' }};
    if (appSharedKey) headers['x-api-key'] = appSharedKey;

    const cb = await fetch(appUrl, {{
      method: 'POST',
      headers,
      body: JSON.stringify(callbackPayload)
    }});

    if (cb.ok) {{
      syncStatus = 'sent';
      sent += 1;
    }} else {{
      syncStatus = 'failed';
      failed += 1;
      syncError = `callback_http_${{cb.status}}`;
    }}
  }}

  const updateBody = {{
    properties: {{
      'Integration Status': {{ select: {{ name: syncStatus }} }},
      'Last Synced At': {{ date: {{ start: new Date().toISOString() }} }},
      'Sync Attempts': {{ number: attempts }},
      'Last Sync Error': {{ rich_text: syncError ? [{{ type: 'text', text: {{ content: trunc(syncError) }} }}] : [] }},
      'Last Event ID': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(eventId, 240) }} }}] }}
    }}
  }};

  await fetch(`https://api.notion.com/v1/pages/${{page.id}}`, {{
    method: 'PATCH',
    headers: notionHeaders,
    body: JSON.stringify(updateBody)
  }});
}}

return [{{
  json: {{
    ok: true,
    processed,
    sent,
    failed,
    skipped,
    appUrlConfigured: !!appUrl
  }}
}}];
""".strip()

    return {
        "name": "MBH - 62 HITL Upgrades Poller (V6)",
        "nodes": [
            {
                "id": "schedule",
                "name": "Schedule Trigger",
                "type": "n8n-nodes-base.scheduleTrigger",
                "typeVersion": 1.2,
                "position": [240, 280],
                "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
            },
            {
                "id": "poll",
                "name": "Poll + Sync",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 280],
                "parameters": {"jsCode": js_code},
            },
        ],
        "connections": {"Schedule Trigger": {"main": [[{"node": "Poll + Sync", "type": "main", "index": 0}]]}},
        "settings": {},
    }


def ai_requests_worker_v6():
    js_code = f"""
const notionToken = (typeof process !== 'undefined' && process.env) ? process.env.NOTION_TOKEN : '';
if (!notionToken) {{
  return [{{ json: {{ ok: false, reason: 'NOTION_TOKEN missing in n8n env' }} }}];
}}

const resultUrl = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_AI_RESULT_URL || '') : '';
const appSharedKey = (typeof process !== 'undefined' && process.env) ? (process.env.MBH_APP_SHARED_KEY || '') : '';
const aiDb = '{ids['NOTION_DB_AI_REQUESTS']}';
const auditDb = '{ids['NOTION_DB_AUDIT_LOGS']}';
const nowIso = new Date().toISOString();
const notionHeaders = {{
  'Authorization': `Bearer ${{notionToken}}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
}};

const queryBody = {{
  filter: {{
    and: [
      {{ property: 'Status', select: {{ equals: 'queued' }} }}
    ]
  }},
  sorts: [{{ property: 'Created At', direction: 'ascending' }}],
  page_size: 20
}};

const qRes = await fetch(`https://api.notion.com/v1/databases/${{aiDb}}/query`, {{
  method: 'POST',
  headers: notionHeaders,
  body: JSON.stringify(queryBody)
}});

if (!qRes.ok) {{
  return [{{ json: {{ ok: false, reason: `query_failed_${{qRes.status}}`, details: await qRes.text() }} }}];
}}

const queryJson = await qRes.json();
const rows = queryJson.results || [];

const getRich = (props, key) => (props?.[key]?.rich_text || []).map((x) => x?.plain_text || '').join('').trim();
const getTitle = (props, key) => (props?.[key]?.title || []).map((x) => x?.plain_text || '').join('').trim();
const getSelect = (props, key) => props?.[key]?.select?.name || '';
const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);

let processed = 0;
let callbacksSent = 0;
let callbackFailed = 0;

for (const page of rows) {{
  processed += 1;
  const props = page.properties || {{}};
  const aiRequestId = getTitle(props, 'AI Request ID') || page.id;
  const userId = getRich(props, 'User ID');
  const promptType = getSelect(props, 'Prompt Type') || 'concierge';
  const prompt = getRich(props, 'Prompt');

  const responseSummary =
    `[AUTO] ${{
      promptType
    }} recommendation for user ${{
      userId || 'unknown'
    }}: focus this week on top 3 high-fit contacts, 2 active opportunities, and 1 circle unlock step.`;

  const updateBody = {{
    properties: {{
      'Response Summary': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(responseSummary) }} }}] }},
      'Status': {{ select: {{ name: 'completed' }} }},
      'Model': {{ rich_text: [{{ type: 'text', text: {{ content: 'n8n-auto-brief-v1' }} }}] }},
      'Completed At': {{ date: {{ start: new Date().toISOString() }} }}
    }}
  }};

  await fetch(`https://api.notion.com/v1/pages/${{page.id}}`, {{
    method: 'PATCH',
    headers: notionHeaders,
    body: JSON.stringify(updateBody)
  }});

  const eventId = `ai-result-${{aiRequestId}}-${{Date.now()}}`;
  const callbackPayload = {{
    event: 'ai.request.completed',
    eventId,
    emittedAt: nowIso,
    source: 'n8n-ai-worker',
    data: {{
      aiRequestId,
      userId,
      promptType,
      prompt,
      responseSummary,
      model: 'n8n-auto-brief-v1',
      completedAt: new Date().toISOString()
    }}
  }};

  let callbackStatus = 'skipped';
  let callbackError = '';

  if (!resultUrl) {{
    callbackStatus = 'skipped';
  }} else {{
    const headers = {{ 'Content-Type': 'application/json' }};
    if (appSharedKey) headers['x-api-key'] = appSharedKey;

    const cb = await fetch(resultUrl, {{
      method: 'POST',
      headers,
      body: JSON.stringify(callbackPayload)
    }});
    if (cb.ok) {{
      callbackStatus = 'sent';
      callbacksSent += 1;
    }} else {{
      callbackStatus = 'failed';
      callbackError = `callback_http_${{cb.status}}`;
      callbackFailed += 1;
    }}
  }}

  const auditBody = {{
    parent: {{ database_id: auditDb }},
    properties: {{
      'Audit ID': {{ title: [{{ type: 'text', text: {{ content: trunc(eventId, 120) }} }}] }},
      'Actor User ID': {{ rich_text: [{{ type: 'text', text: {{ content: 'n8n-ai-worker' }} }}] }},
      'Action': {{ rich_text: [{{ type: 'text', text: {{ content: 'ai.request.completed' }} }}] }},
      'Target Type': {{ rich_text: [{{ type: 'text', text: {{ content: 'ai_request' }} }}] }},
      'Target ID': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(aiRequestId, 240) }} }}] }},
      'Metadata': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(JSON.stringify({{ callbackStatus, callbackError, userId, promptType }})) }} }}] }},
      'Created At': {{ date: {{ start: new Date().toISOString() }} }}
    }}
  }};

  await fetch('https://api.notion.com/v1/pages', {{
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify(auditBody)
  }});
}}

return [{{
  json: {{
    ok: true,
    processed,
    callbacksSent,
    callbackFailed,
    resultUrlConfigured: !!resultUrl
  }}
}}];
""".strip()

    return {
        "name": "MBH - 63 AI Requests Worker (V6)",
        "nodes": [
            {
                "id": "schedule",
                "name": "Schedule Trigger",
                "type": "n8n-nodes-base.scheduleTrigger",
                "typeVersion": 1.2,
                "position": [240, 280],
                "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}},
            },
            {
                "id": "process",
                "name": "Process AI Queue",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 280],
                "parameters": {"jsCode": js_code},
            },
        ],
        "connections": {"Schedule Trigger": {"main": [[{"node": "Process AI Queue", "type": "main", "index": 0}]]}},
        "settings": {},
    }


def weekly_brief_v6():
    js_code = f"""
const notionToken = (typeof process !== 'undefined' && process.env) ? process.env.NOTION_TOKEN : '';
if (!notionToken) {{
  return [{{ json: {{ ok: false, reason: 'NOTION_TOKEN missing in n8n env' }} }}];
}}

const usersDb = '{ids['NOTION_DB_USERS']}';
const notificationsDb = '{ids['NOTION_DB_NOTIFICATIONS']}';
const auditDb = '{ids['NOTION_DB_AUDIT_LOGS']}';
const nowIso = new Date().toISOString();
const notionHeaders = {{
  'Authorization': `Bearer ${{notionToken}}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
}};

const queryBody = {{
  filter: {{
    or: [
      {{ property: 'Access Level', select: {{ equals: 'curated' }} }},
      {{ property: 'Access Level', select: {{ equals: 'verified' }} }},
      {{ property: 'Access Level', select: {{ equals: 'insider' }} }}
    ]
  }},
  page_size: 25
}};

const qRes = await fetch(`https://api.notion.com/v1/databases/${{usersDb}}/query`, {{
  method: 'POST',
  headers: notionHeaders,
  body: JSON.stringify(queryBody)
}});

if (!qRes.ok) {{
  return [{{ json: {{ ok: false, reason: `query_failed_${{qRes.status}}`, details: await qRes.text() }} }}];
}}

const queryJson = await qRes.json();
const rows = queryJson.results || [];
const getTitle = (props, key) => (props?.[key]?.title || []).map((x) => x?.plain_text || '').join('').trim();
const trunc = (value, limit = 1800) => String(value ?? '').slice(0, limit);

let created = 0;
for (const page of rows) {{
  const props = page.properties || {{}};
  const userId = getTitle(props, 'User ID') || '';
  if (!userId) continue;

  const notificationBody = {{
    parent: {{ database_id: notificationsDb }},
    properties: {{
      'Notification ID': {{ title: [{{ type: 'text', text: {{ content: trunc(`notif-weekly-${{userId}}-${{Date.now()}}`, 120) }} }}] }},
      'User ID': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(userId, 240) }} }}] }},
      'Kind': {{ rich_text: [{{ type: 'text', text: {{ content: 'weekly.brief.ready' }} }}] }},
      'Title': {{ rich_text: [{{ type: 'text', text: {{ content: 'Your strategic weekly brief is ready' }} }}] }},
      'Body': {{ rich_text: [{{ type: 'text', text: {{ content: '3 contacts, 2 opportunities, 1 room recommendation are prepared for you.' }} }}] }},
      'Channel': {{ select: {{ name: 'in_app' }} }},
      'Created At': {{ date: {{ start: nowIso }} }}
    }}
  }};

  const createRes = await fetch('https://api.notion.com/v1/pages', {{
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify(notificationBody)
  }});

  if (createRes.ok) created += 1;
}}

const auditEventId = `weekly-brief-${{Date.now()}}`;
const auditBody = {{
  parent: {{ database_id: auditDb }},
  properties: {{
    'Audit ID': {{ title: [{{ type: 'text', text: {{ content: trunc(auditEventId, 120) }} }}] }},
    'Actor User ID': {{ rich_text: [{{ type: 'text', text: {{ content: 'n8n-weekly-brief' }} }}] }},
    'Action': {{ rich_text: [{{ type: 'text', text: {{ content: 'weekly.brief.generated' }} }}] }},
    'Target Type': {{ rich_text: [{{ type: 'text', text: {{ content: 'notifications' }} }}] }},
    'Target ID': {{ rich_text: [{{ type: 'text', text: {{ content: String(created) }} }}] }},
    'Metadata': {{ rich_text: [{{ type: 'text', text: {{ content: trunc(JSON.stringify({{created}})) }} }}] }},
    'Created At': {{ date: {{ start: nowIso }} }}
  }}
}};

await fetch('https://api.notion.com/v1/pages', {{
  method: 'POST',
  headers: notionHeaders,
  body: JSON.stringify(auditBody)
}});

return [{{ json: {{ ok: true, usersEvaluated: rows.length, notificationsCreated: created }} }}];
""".strip()

    return {
        "name": "MBH - 64 Weekly Strategic Brief Generator (V6B)",
        "nodes": [
            {
                "id": "schedule",
                "name": "Schedule Trigger",
                "type": "n8n-nodes-base.scheduleTrigger",
                "typeVersion": 1.2,
                "position": [220, 280],
                "parameters": {
                    "rule": {
                        "interval": [
                            {"field": "hours", "hoursInterval": 168},
                        ]
                    }
                },
            },
            {
                "id": "generate",
                "name": "Generate Brief Notifications",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [560, 280],
                "parameters": {"jsCode": js_code},
            },
        ],
        "connections": {
            "Schedule Trigger": {"main": [[{"node": "Generate Brief Notifications", "type": "main", "index": 0}]]}
        },
        "settings": {},
    }


payloads = [
    applications_poller_v6(),
    upgrades_poller_v6(),
    ai_requests_worker_v6(),
    weekly_brief_v6(),
]

existing = list_workflows()
existing_by_name = {wf.get("name"): wf for wf in existing}

summary = {
    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "baseUrl": BASE_URL,
    "results": [],
}

for wf in payloads:
    summary["results"].append(create_workflow_if_missing(wf, existing_by_name))

out_path = Path("scripts/n8n/workflows.v6-extended.created.json")
out_path.write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print(f"Saved summary to {out_path}")
