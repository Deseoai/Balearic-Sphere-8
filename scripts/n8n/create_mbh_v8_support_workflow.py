#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("N8N_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("N8N_API_KEY", "")
OPENAI_CREDENTIAL_ID = os.environ.get("N8N_OPENAI_CREDENTIAL_ID", "").strip()
OPENAI_CREDENTIAL_NAME = os.environ.get("N8N_OPENAI_CREDENTIAL_NAME", "OpenAi account_Altinger").strip()
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


def resolve_openai_credential():
    if OPENAI_CREDENTIAL_ID:
        return {"id": OPENAI_CREDENTIAL_ID, "name": OPENAI_CREDENTIAL_NAME or "OpenAI"}

    credentials = list_credentials()
    for item in credentials:
        if item.get("type") == "openAiApi" and item.get("name") == OPENAI_CREDENTIAL_NAME and item.get("id"):
            return {"id": item["id"], "name": item.get("name") or "OpenAI"}

    for item in credentials:
        if item.get("type") == "openAiApi" and item.get("id"):
            return {"id": item["id"], "name": item.get("name") or "OpenAI"}

    return None


def update_workflow(workflow_id: str, workflow):
    payload = {}
    for key in ("name", "nodes", "connections", "settings", "pinData", "staticData", "meta", "tags"):
        if key in workflow:
            payload[key] = workflow[key]
    return request_json("PUT", f"/api/v1/workflows/{workflow_id}", payload)


def activate_workflow(workflow_id: str):
    return request_json("POST", f"/api/v1/workflows/{workflow_id}/activate", {})


def extract_webhook_url(workflow):
    webhook_path = None
    for node in workflow.get("nodes", []):
        if node.get("type") == "n8n-nodes-base.webhook":
            webhook_path = node.get("parameters", {}).get("path")
            break
    if not webhook_path:
        return None
    return f"{BASE_URL}/webhook/{webhook_path}"


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


def support_chat_workflow(openai_credential):
    normalize_code = """
const source = $json?.body && typeof $json.body === 'object' ? $json.body : ($json || {});
const payload = source.data && typeof source.data === 'object' ? source.data : source;
const message = String(payload.message || '').trim().slice(0, 1800);
if (!message) {
  return [{
    json: {
      answer: 'Please ask a question so I can help you.',
      suggestions: [
        'How do credits work?',
        'How do I unlock intros?',
        'How can I move to a higher access level?'
      ]
    }
  }];
}

return [{
  json: {
    message,
    userId: String(payload.userId || 'guest'),
    userEmail: String(payload.userEmail || ''),
    locale: String(payload.locale || 'en'),
    sessionId: String(payload.userId || payload.userEmail || 'guest')
  }
}];
""".strip()

    format_code = """
const raw = $json.output ?? $json.text ?? $json.reply ?? $json.answer ?? '';
const answer = String(raw || '').trim();
return [{
  json: {
    answer: answer || 'I can help with credits, access, intros and AI actions. Tell me your goal and I will guide you step by step.',
    suggestions: [
      'Show me the best next action for this week',
      'How many credits do I need for intro unlocks?',
      'How do I increase my access level quickly?'
    ]
  }
}];
""".strip()

    prompt = """
You are the Balea Sphere member support assistant.

User message:
{{$json.message}}

Context:
- userId: {{$json.userId}}
- userEmail: {{$json.userEmail}}
- locale: {{$json.locale}}

Rules:
1) Default to English. If the user writes in another language, reply in that language.
2) Be concise, clear, and practical.
3) Explain platform value and next actions in plain user language.
4) Never mention internal systems, workflow names, or implementation details.
5) When relevant, clarify credit logic:
   - AI request costs credits
   - concierge costs credits
   - listing publish costs credits
   - circle access request costs credits
   - intro unlock costs credits
6) End with one concrete next step.
""".strip()

    workflow = {
        "name": "MBH - 81 Support Assistant (V8)",
        "nodes": [
            {
                "id": "webhook",
                "name": "Webhook In",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [220, 280],
                "webhookId": "mbh-v8-support-chat",
                "parameters": {
                    "httpMethod": "POST",
                    "path": "mbh/v8/support/chat",
                    "responseMode": "responseNode",
                    "options": {"rawBody": False},
                },
            },
            {
                "id": "normalize",
                "name": "Normalize Input",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [480, 280],
                "parameters": {"jsCode": normalize_code},
            },
            {
                "id": "agent",
                "name": "AI Agent",
                "type": "@n8n/n8n-nodes-langchain.agent",
                "typeVersion": 2,
                "position": [760, 280],
                "parameters": {
                    "promptType": "define",
                    "text": prompt,
                    "options": {},
                },
            },
            {
                "id": "model",
                "name": "OpenAI Chat Model",
                "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
                "typeVersion": 1.2,
                "position": [760, 520],
                "parameters": {
                    "model": {
                        "__rl": True,
                        "mode": "list",
                        "value": "gpt-4o-mini"
                    },
                    "builtInTools": {},
                    "options": {}
                },
            },
            {
                "id": "memory",
                "name": "Simple Memory",
                "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
                "typeVersion": 1.3,
                "position": [980, 520],
                "parameters": {
                    "sessionIdType": "customKey",
                    "sessionKey": "={{$json.sessionId}}",
                    "contextWindowLength": 8
                },
            },
            {
                "id": "format",
                "name": "Format Response",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [1040, 280],
                "parameters": {"jsCode": format_code},
            },
            {
                "id": "respond",
                "name": "Respond to Webhook",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.3,
                "position": [1280, 280],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": "={{$json}}",
                    "options": {},
                },
            },
        ],
        "connections": {
            "Webhook In": {"main": [[{"node": "Normalize Input", "type": "main", "index": 0}]]},
            "Normalize Input": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
            "AI Agent": {"main": [[{"node": "Format Response", "type": "main", "index": 0}]]},
            "Format Response": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
            "OpenAI Chat Model": {
                "ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]
            },
            "Simple Memory": {
                "ai_memory": [[{"node": "AI Agent", "type": "ai_memory", "index": 0}]]
            },
        },
        "settings": {},
    }

    if openai_credential:
        for node in workflow["nodes"]:
            if node.get("id") == "model":
                node["credentials"] = {"openAiApi": openai_credential}
                break

    return workflow


def main():
    openai_credential = resolve_openai_credential()
    existing = list_workflows()
    existing_by_name = {item.get("name"): item for item in existing if item.get("name")}

    workflows = [support_chat_workflow(openai_credential)]
    results = [create_workflow_if_missing(workflow, existing_by_name) for workflow in workflows]

    output_path = Path("scripts/n8n/workflows.v8-support.created.json")
    output_path.write_text(
        json.dumps(
            {"baseUrl": BASE_URL, "openAiCredential": openai_credential, "results": results},
            indent=2,
        ),
        encoding="utf-8",
    )

    print(json.dumps({"baseUrl": BASE_URL, "openAiCredential": openai_credential, "results": results}, indent=2))
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
