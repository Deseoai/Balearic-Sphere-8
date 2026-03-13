#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_VERSION = os.environ.get("NOTION_VERSION", "2022-06-28")

if not NOTION_TOKEN:
    raise SystemExit("Missing NOTION_TOKEN")

ids_path = Path("docs/notion-database-ids.env")
if not ids_path.exists():
    raise SystemExit(f"Missing {ids_path}")


def parse_env(path: Path):
    out = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


ids = parse_env(ids_path)

TARGETS = {
    "NOTION_DB_APPLICATIONS": "Applications",
    "NOTION_DB_CIRCLE_ACCESS_REQUESTS": "Circle Access Requests",
}

SYNC_PROPERTIES = {
    "Integration Status": {
        "select": {
            "options": [
                {"name": "queued"},
                {"name": "sent"},
                {"name": "failed"},
                {"name": "skipped"},
            ]
        }
    },
    "Last Synced At": {"date": {}},
    "Sync Attempts": {"number": {}},
    "Last Sync Error": {"rich_text": {}},
    "Last Event ID": {"rich_text": {}},
}


def patch_database(database_id: str, properties: dict):
    url = f"https://api.notion.com/v1/databases/{database_id}"
    payload = {"properties": properties}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {NOTION_TOKEN}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"PATCH database {database_id} failed: HTTP {exc.code} {body}") from exc


summary = {"updated": []}

for env_key, label in TARGETS.items():
    db_id = ids.get(env_key)
    if not db_id:
        raise SystemExit(f"Missing {env_key} in docs/notion-database-ids.env")

    patch_database(db_id, SYNC_PROPERTIES)
    summary["updated"].append({"name": label, "id": db_id})
    print(f"Updated {label}: {db_id}")

out_path = Path("scripts/notion/databases.sync-fields.json")
out_path.write_text(json.dumps(summary, indent=2))
print(f"Saved summary to {out_path}")
