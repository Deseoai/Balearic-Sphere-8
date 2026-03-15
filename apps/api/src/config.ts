import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  DATA_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().url().optional(),
  APP_BASE_URL: z.string().url().default("https://app.balea-sphere8.com"),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().min(5).max(1440).default(30),
  SESSION_TTL_DAYS: z.coerce.number().min(1).max(90).default(30),
  CORS_ORIGIN: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  WEBHOOK_SECRET: z.string().min(16).default("replace-with-long-random-secret"),
  WEBHOOK_MAX_SKEW_SECONDS: z.coerce.number().default(300),
  ADMIN_API_TOKEN: z.string().min(20).default("replace-with-strong-admin-token"),
  ADMIN_PANEL_PASSWORD: z.string().min(8).default("replace-with-admin-password"),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().min(1).max(168).default(12),
  ALERTS_FROM_EMAIL: z.string().email().default("management@balea-sphere8.com"),
  ADMIN_NOTIFY_EMAIL: z.string().email().optional(),
  MBH_APP_SHARED_KEY: z.string().optional(),
  N8N_EVENTS_WEBHOOK_URL: z.string().url().optional(),
  N8N_HITL_APPLICATION_WEBHOOK_URL: z.string().url().optional(),
  N8N_HITL_UPGRADE_WEBHOOK_URL: z.string().url().optional(),
  N8N_EMAIL_ALERT_WEBHOOK_URL: z.string().url().optional(),
  N8N_SUPPORT_WEBHOOK_URL: z.string().url().optional(),
  N8N_AI_TOOLS_WEBHOOK_URL: z.string().url().optional(),
  N8N_REWARDS_WEBHOOK_URL: z.string().url().optional(),
  N8N_PUSH_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),
  N8N_TIMEOUT_MS: z.coerce.number().default(8000),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_SEARCH_CX: z.string().optional()
});

const parsed = envSchema.parse(process.env);

if (parsed.DATA_BACKEND === "postgres" && !parsed.DATABASE_URL) {
  throw new Error("DATABASE_URL is required when DATA_BACKEND=postgres");
}

const originString = parsed.CORS_ORIGINS ?? parsed.CORS_ORIGIN ?? "http://localhost:3000";
const corsOrigins = originString
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const env = {
  ...parsed,
  CORS_ORIGINS_LIST: corsOrigins
};
