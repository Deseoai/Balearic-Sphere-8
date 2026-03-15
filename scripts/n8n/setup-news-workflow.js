#!/usr/bin/env node
/**
 * Balea Sphere — News n8n Workflow Setup
 *
 * This script documents the n8n workflow for automatic news fetching.
 * Import the workflow JSON below into n8n manually.
 *
 * Workflow: "MBH - 80 News Refresh Worker"
 * - Trigger: Schedule every 6 hours
 * - Step 1: POST /v1/news/refresh (fetches Google News RSS + Custom Search)
 * - Step 2: Notion — log fetched news to "Balea Sphere — News" DB
 */

const workflow = {
  name: "MBH - 80 News Refresh Worker",
  nodes: [
    {
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      parameters: { rule: { interval: [{ field: "hours", hoursInterval: 6 }] } }
    },
    {
      name: "Refresh News",
      type: "n8n-nodes-base.httpRequest",
      parameters: {
        method: "POST",
        url: "={{$env.APP_API_URL}}/v1/news/refresh",
        authentication: "genericCredentialType",
        sendHeaders: true,
        headers: { parameters: [{ name: "Authorization", value: "Bearer {{$env.MBH_APP_SHARED_KEY}}" }] },
        sendBody: true,
        body: { mode: "json", jsonBody: '{"query": "Baleares Mallorca Ibiza business real estate 2025"}' }
      }
    },
    {
      name: "Log to Notion",
      type: "n8n-nodes-base.notion",
      parameters: {
        operation: "create",
        databaseId: "NEWS_NOTION_DB_ID",
        title: "News refresh — {{ $now.toISO() }}",
        properties: { "Refreshed": { number: "={{ $json.refreshed }}" } }
      }
    }
  ]
};

console.log("=== Balea Sphere News Workflow ===");
console.log("Import this workflow JSON into n8n:");
console.log(JSON.stringify(workflow, null, 2));
console.log("\nSetup steps:");
console.log("1. Create Notion DB 'Balea Sphere — News' with fields: Title, URL, Source, Description, Published At, Category");
console.log("2. Set APP_API_URL env in n8n to your API base URL");
console.log("3. Set MBH_APP_SHARED_KEY env in n8n");
console.log("4. Optionally set GOOGLE_API_KEY and GOOGLE_SEARCH_CX in .env.production for Custom Search");
