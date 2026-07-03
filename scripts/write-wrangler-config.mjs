import { writeFileSync } from "node:fs";

const d1DatabaseId = requiredEnv("D1_DATABASE_ID");
const kvNamespaceId = requiredEnv("KV_NAMESPACE_ID");

const config = `name = "vocabulary-worker"
main = "src/index.ts"
compatibility_date = "2026-07-03"
workers_dev = true

[observability]
enabled = true

[vars]
APP_ENV = "${process.env.APP_ENV ?? "production"}"
DEEPSEEK_BASE_URL = "${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}"
CACHE_TTL_SECONDS = "${process.env.CACHE_TTL_SECONDS ?? "2592000"}"

[[d1_databases]]
binding = "DB"
database_name = "${process.env.D1_DATABASE_NAME ?? "vocabulary"}"
database_id = "${d1DatabaseId}"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "TRANSLATION_CACHE"
id = "${kvNamespaceId}"
`;

writeFileSync("wrangler.toml", config);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to generate wrangler.toml`);
  }
  return value;
}
