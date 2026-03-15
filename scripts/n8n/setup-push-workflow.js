#!/usr/bin/env node
/**
 * Creates the "MBH - Push Notification Worker (V1)" n8n workflow.
 *
 * Uses Expo Push Notification Service — no APNs keys needed.
 * Expo handles APNs + FCM delivery automatically.
 *
 * Prerequisites:
 *   - n8n running at N8N_BASE_URL
 *   - Mobile app built with Expo SDK (Expo Go or EAS build)
 *
 * Usage:
 *   N8N_BASE_URL=https://cpmn8n.deseo-services.com \
 *   N8N_API_KEY=your-key \
 *   node scripts/n8n/setup-push-workflow.js
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "https://cpmn8n.deseo-services.com";
const N8N_API_KEY = process.env.N8N_API_KEY ?? "";

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY is required");
  process.exit(1);
}

const workflow = {
  name: "MBH - Push Notification Worker (V1)",
  active: true,
  nodes: [
    {
      id: "webhook-trigger",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: "POST",
        path: "mbh/v11/push/send",
        responseMode: "onReceived",
        responseData: "allEntries"
      }
    },
    {
      id: "extract-tokens",
      name: "Extract Tokens",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: {
        jsCode: `
// Build one Expo push message per device token
const body = $input.first().json.body ?? $input.first().json;
const tokens = body.data?.deviceTokens ?? [];
const title = body.data?.title ?? "Balea Sphere";
const message = body.data?.body ?? "";
const extraData = body.data?.data ?? {};

// Return one item per token (Expo push message format)
return tokens.map(to => ({
  json: {
    to,
    title,
    body: message,
    data: extraData,
    sound: "default",
    badge: 1
  }
}));
        `.trim()
      }
    },
    {
      id: "send-expo-push",
      name: "Send via Expo Push",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [720, 300],
      parameters: {
        method: "POST",
        url: "https://exp.host/--/api/v2/push/send",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Content-Type", value: "application/json" },
            { name: "Accept", value: "application/json" },
            { name: "Accept-Encoding", value: "gzip, deflate" }
          ]
        },
        sendBody: true,
        contentType: "json",
        body: {
          to: "={{ $json.to }}",
          title: "={{ $json.title }}",
          body: "={{ $json.body }}",
          data: "={{ $json.data }}",
          sound: "default",
          badge: 1
        },
        options: {
          response: {
            response: {
              neverError: true
            }
          }
        }
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: "Extract Tokens", type: "main", index: 0 }]]
    },
    "Extract Tokens": {
      main: [[{ node: "Send via Expo Push", type: "main", index: 0 }]]
    }
  }
};

async function createWorkflow() {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": N8N_API_KEY
    },
    body: JSON.stringify(workflow)
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed: ${res.status} ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  const webhookUrl = `${N8N_BASE_URL}/webhook/mbh/v11/push/send`;

  console.log("✓ Workflow created:", data.name);
  console.log("  ID:", data.id);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Add to .env.production:");
  console.log(`     N8N_PUSH_WEBHOOK_URL=${webhookUrl}`);
  console.log("");
  console.log("  2. Restart API:");
  console.log("     systemctl restart balea-api.service");
  console.log("");
  console.log("  Note: Uses Expo Push Service — no APNs keys needed.");
  console.log("  Works automatically with Expo Go and EAS builds.");
}

createWorkflow().catch(console.error);
