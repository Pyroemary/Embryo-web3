import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),

  PRIVY_APP_ID: z.string().default(""),
  AUTH_DEV_BYPASS: bool,
  ADMIN_API_KEY: z.string().default(""),

  SUMSUB_APP_TOKEN: z.string().default(""),
  SUMSUB_SECRET_KEY: z.string().default(""),
  SUMSUB_WEBHOOK_SECRET: z.string().default(""),
  SUMSUB_LEVEL_NAME: z.string().default("embryo-basic-kyc"),

  CARD_ISSUER: z.enum(["mock", "rain"]).default("mock"),
  RAIN_API_URL: z.string().default("https://api.raincards.xyz"),
  RAIN_API_KEY: z.string().default(""),
  RAIN_WEBHOOK_SECRET: z.string().default(""),

  CHAIN: z.enum(["base", "baseSepolia"]).default("baseSepolia"),
  RPC_URL: z.string().default("https://sepolia.base.org"),
  KEEPER_PRIVATE_KEY: z.string().default(""),
  ROUNDUP_ROUTER_ADDRESS: z.string().default(""),
  ALLOWLIST_GATE_ADDRESS: z.string().default(""),
  CHAIN_DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v !== "false"),

  SETTLEMENT_CRON_ENABLED: bool,
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  if (parsed.NODE_ENV === "production") {
    const problems: string[] = [];
    if (parsed.AUTH_DEV_BYPASS) problems.push("AUTH_DEV_BYPASS must be false");
    if (!parsed.PRIVY_APP_ID) problems.push("PRIVY_APP_ID required");
    if (!parsed.SUMSUB_WEBHOOK_SECRET) problems.push("SUMSUB_WEBHOOK_SECRET required");
    if (parsed.CARD_ISSUER !== "rain") problems.push("CARD_ISSUER must be rain");
    if (!parsed.RAIN_WEBHOOK_SECRET) problems.push("RAIN_WEBHOOK_SECRET required");
    if (parsed.CHAIN_DRY_RUN) problems.push("CHAIN_DRY_RUN must be false");
    if (parsed.ADMIN_API_KEY.length < 32) problems.push("ADMIN_API_KEY must be >= 32 chars");
    if (problems.length) throw new Error(`Unsafe production config: ${problems.join("; ")}`);
  }
  return parsed;
}

export function config(): AppConfig {
  return (cached ??= loadConfig());
}

export function resetConfigForTests() {
  cached = undefined;
}

export const CONFIG = Symbol("CONFIG");
