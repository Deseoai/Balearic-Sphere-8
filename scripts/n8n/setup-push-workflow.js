#!/usr/bin/env node
/**
 * Creates the "MBH - Push Notification Worker" n8n workflow.
 *
 * This workflow:
 *   1. Receives push.notification.send events from the API
 *   2. For each device token in the payload, sends an APNs HTTP/2 push via n8n HTTP Request node
 *
 * Prerequisites:
 *   - n8n instance running at N8N_BASE_URL
 *   - APNs .p8 key file (JWT-based auth) or certificate
 *   - Set env vars: N8N_BASE_URL, N8N_API_KEY, APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID
 *
 * Usage:
 *   N8N_BASE_URL=https://cpmn8n.deseo-services.com \
 *   N8N_API_KEY=your-key \
 *   node scripts/n8n/setup-push-workflow.js
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "https://cpmn8n.deseo-services.com";
const N8N_API_KEY = process.env.N8N_API_KEY ?? "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "com.balea-sphere.app";
const APNS_ENV = process.env.APNS_ENV ?? "production"; // "sandbox" or "production"

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY is required");
  process.exit(1);
}

/**
 * n8n workflow definition.
 *
 * Flow:
 *   Webhook (POST /mbh/v11/push/send) →
 *   Code node: extract deviceTokens, iterate →
 *   HTTP Request: call APNs for each token
 *
 * APNs auth: uses n8n Credentials of type "httpHeaderAuth" with the
 * Authorization: bearer {jwt} header. The JWT must be generated externally
 * (e.g. via a separate n8n Code node using your .p8 key).
 *
 * For a simpler setup without JWT generation in n8n, use Firebase Cloud
 * Messaging (FCM) instead — FCM supports both iOS and Android with a
 * single HTTP POST using a server key.
 */
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
// Extract device tokens from the payload
const body = $input.first().json.body ?? $input.first().json;
const tokens = body.data?.deviceTokens ?? [];
const title = body.data?.title ?? "Balea Sphere";
const message = body.data?.body ?? "";
const userId = body.data?.userId ?? "";
const extraData = body.data?.data ?? {};

// Return one item per token
return tokens.map(token => ({
  json: {
    deviceToken: token,
    title,
    message,
    userId,
    extraData,
    apnsHost: "${APNS_ENV === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com"}",
    bundleId: "${APNS_BUNDLE_ID}"
  }
}));
        `.trim()
      }
    },
    {
      id: "send-apns",
      name: "Send APNs Push",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [720, 300],
      parameters: {
        method: "POST",
        url: "=https://{{ $json.apnsHost }}/3/device/{{ $json.deviceToken }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apns-topic", value: "={{ $json.bundleId }}" },
            { name: "apns-push-type", value: "alert" },
            { name: "apns-expiration", value: "0" },
            { name: "apns-priority", value: "10" }
          ]
        },
        sendBody: true,
        contentType: "json",
        body: {
          aps: {
            alert: {
              title: "={{ $json.title }}",
              body: "={{ $json.message }}"
            },
            sound: "default",
            badge: 1
          }
        },
        options: {
          response: {
            response: {
              neverError: true
            }
          }
        }
      }
    },
    {
      id: "respond-ok",
      name: "Respond",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [960, 300],
      parameters: {
        respondWith: "json",
        responseBody: '{"ok":true}'
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: "Extract Tokens", type: "main", index: 0 }]]
    },
    "Extract Tokens": {
      main: [[{ node: "Send APNs Push", type: "main", index: 0 }]]
    },
    "Send APNs Push": {
      main: [[{ node: "Respond", type: "main", index: 0 }]]
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
    console.error(`Failed to create workflow: ${res.status} ${body}`);
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
  console.log("  2. APNs JWT auth setup in n8n:");
  console.log("     - Go to n8n Settings → Credentials → Add 'HTTP Header Auth'");
  console.log("     - Name: 'APNs JWT'");
  console.log("     - Header Name: Authorization");
  console.log("     - Header Value: bearer {your-apns-jwt}");
  console.log("     - APNs JWT: sign with your .p8 key (Team ID + Key ID)");
  console.log("     - Assign the credential to the 'Send APNs Push' node");
  console.log("");
  console.log("  3. Alternative — use Firebase Cloud Messaging (FCM) instead of APNs directly:");
  console.log("     FCM supports both iOS + Android with a single POST to:");
  console.log("     https://fcm.googleapis.com/v1/projects/{project}/messages:send");
  console.log("     Replace the 'Send APNs Push' node with an FCM HTTP Request node.");
  console.log("");
  console.log("  4. Restart the API to pick up N8N_PUSH_WEBHOOK_URL.");
}

createWorkflow().catch(console.error);
