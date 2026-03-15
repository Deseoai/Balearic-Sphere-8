import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config.js";
import { registerAccessRequestRoutes } from "./routes/accessRequests.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCallbackRoutes } from "./routes/callbacks.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerCircleAccessRoutes } from "./routes/circleAccess.js";
import { registerCreditRoutes } from "./routes/credits.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { registerNetworkRoutes } from "./routes/network.js";
import { registerPitchRoutes } from "./routes/pitches.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerRewardsRoutes } from "./routes/rewards.js";
import { registerReferralRoutes } from "./routes/referrals.js";
import { registerEliteRoutes } from "./routes/elite.js";
import { registerNewsRoutes } from "./routes/news.js";
import { registerDealRoomRoutes } from "./routes/dealRoom.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { initStore } from "./store/index.js";

const app = Fastify({ logger: true, bodyLimit: 5_242_880 }); // 5MB

await initStore();

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, env.CORS_ORIGINS_LIST.includes(origin));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
});

app.get("/health", async () => ({
  status: "ok",
  service: "mallorca-api",
  at: new Date().toISOString()
}));

await registerAccessRequestRoutes(app);
await registerAuthRoutes(app);
await registerCreditRoutes(app);
await registerCircleAccessRoutes(app);
await registerMarketplaceRoutes(app);
await registerChatRoutes(app);
await registerAiRoutes(app);
await registerNetworkRoutes(app);
await registerAdminRoutes(app);
await registerWebhookRoutes(app);
await registerCallbackRoutes(app);
await registerPitchRoutes(app);
await registerRewardsRoutes(app);
await registerEventRoutes(app);
await registerReferralRoutes(app);
await registerEliteRoutes(app);
await registerNewsRoutes(app);
await registerDealRoomRoutes(app);

try {
  await app.listen({
    host: env.API_HOST,
    port: env.API_PORT
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
