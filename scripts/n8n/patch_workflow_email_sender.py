#!/usr/bin/env python3
import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request


def request_json(base_url: str, api_key: str, method: str, path: str, payload=None):
    url = f"{base_url}{path}"
    headers = {"X-N8N-API-KEY": api_key, "Content-Type": "application/json"}
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {body}") from exc


def unwrap_data(obj):
    if isinstance(obj, dict) and "data" in obj:
        return obj["data"]
    return obj


def list_workflows(base_url: str, api_key: str):
    out = []
    cursor = None
    while True:
        qs = "?limit=100"
        if cursor:
            qs += "&cursor=" + urllib.parse.quote(cursor)
        res = request_json(base_url, api_key, "GET", f"/api/v1/workflows{qs}")
        data = res.get("data", [])
        if not isinstance(data, list):
            data = []
        out.extend(data)
        cursor = res.get("nextCursor")
        if not cursor:
            break
    return out


def find_workflow_id_by_name(base_url: str, api_key: str, name: str):
    workflows = list_workflows(base_url, api_key)
    for workflow in workflows:
        if workflow.get("name") == name:
            return workflow.get("id")
    return None


def get_workflow(base_url: str, api_key: str, workflow_id: str):
    raw = request_json(base_url, api_key, "GET", f"/api/v1/workflows/{urllib.parse.quote(workflow_id)}")
    workflow = unwrap_data(raw)
    if not isinstance(workflow, dict) or not workflow.get("id"):
        raise RuntimeError(f"Workflow {workflow_id} konnte nicht geladen werden.")
    return workflow


def update_workflow(base_url: str, api_key: str, workflow_id: str, workflow: dict):
    payload = {
        "name": workflow.get("name"),
        "nodes": workflow.get("nodes", []),
        "connections": workflow.get("connections", {}),
        "settings": {},
    }
    return request_json(base_url, api_key, "PUT", f"/api/v1/workflows/{urllib.parse.quote(workflow_id)}", payload)


def activate_workflow(base_url: str, api_key: str, workflow_id: str):
    return request_json(
        base_url,
        api_key,
        "POST",
        f"/api/v1/workflows/{urllib.parse.quote(workflow_id)}/activate",
        {},
    )


def main():
    parser = argparse.ArgumentParser(
        description="Setzt fromEmail und optional toEmail in allen Email-Send-Nodes eines n8n-Workflows."
    )
    parser.add_argument("--workflow-id", default="", help="Workflow ID (optional, hat Vorrang vor Name)")
    parser.add_argument("--workflow-name", default="", help="Workflow Name falls ID nicht gesetzt")
    parser.add_argument(
        "--from-email",
        default="management@balea-sphere8.com",
        help="Gewuenschter From-Absender",
    )
    parser.add_argument(
        "--to-email",
        default="",
        help="Optionale feste Empfaengeradresse. Leer lassen, um toEmail unveraendert zu lassen.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Nur anzeigen, nichts aendern")
    args = parser.parse_args()

    base_url = os.environ.get("N8N_BASE_URL", "https://cpmn8n.deseo-services.com").rstrip("/")
    api_key = os.environ.get("N8N_API_KEY", "").strip()

    if not api_key:
        raise SystemExit("Missing N8N_API_KEY")

    workflow_id = args.workflow_id.strip()
    if not workflow_id:
        workflow_name = args.workflow_name.strip()
        if not workflow_name:
            raise SystemExit("Bitte --workflow-id oder --workflow-name angeben.")
        workflow_id = find_workflow_id_by_name(base_url, api_key, workflow_name)
        if not workflow_id:
            raise SystemExit(f"Workflow nicht gefunden: {workflow_name}")

    workflow = get_workflow(base_url, api_key, workflow_id)
    was_active = bool(workflow.get("active"))
    changed = []

    for node in workflow.get("nodes", []):
        if node.get("type") != "n8n-nodes-base.emailSend":
            continue
        params = node.setdefault("parameters", {})
        node_change = {
            "nodeName": node.get("name", ""),
            "nodeId": node.get("id", ""),
        }
        changed_this_node = False

        current = str(params.get("fromEmail", "")).strip()
        if current != args.from_email:
            params["fromEmail"] = args.from_email
            node_change["oldFromEmail"] = current
            node_change["newFromEmail"] = args.from_email
            changed_this_node = True

        to_email = args.to_email.strip()
        if to_email:
            current_to = str(params.get("toEmail", "")).strip()
            if current_to != to_email:
                params["toEmail"] = to_email
                node_change["oldToEmail"] = current_to
                node_change["newToEmail"] = to_email
                changed_this_node = True

        if changed_this_node:
            changed.append(node_change)

    result = {
        "baseUrl": base_url,
        "workflowId": workflow_id,
        "workflowName": workflow.get("name"),
        "wasActive": was_active,
        "changedNodes": changed,
        "changedCount": len(changed),
        "dryRun": args.dry_run,
    }

    if not changed:
        print(json.dumps(result, indent=2))
        return

    if args.dry_run:
        print(json.dumps(result, indent=2))
        return

    update_workflow(base_url, api_key, workflow_id, workflow)
    reactivated = False
    if was_active:
        try:
            activate_workflow(base_url, api_key, workflow_id)
            reactivated = True
        except Exception:
            # Manche n8n-Versionen behalten den Status aktiv nach PUT.
            reactivated = False

    result["reactivated"] = reactivated
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
